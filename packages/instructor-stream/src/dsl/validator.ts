import OpenAI from 'openai'
import { RefinementCtx, z } from 'zod'
import { GenericClient } from '@/index.ts'
import { InstructorClient } from '../instructor.ts'

type AsyncSuperRefineFunction = (data: string, ctx: RefinementCtx) => Promise<void>

export const LLMValidator = <C extends GenericClient | OpenAI>(
  instructor: InstructorClient<C>,
  statement: string,
  params: Omit<OpenAI.ChatCompletionCreateParams, 'messages'>
): AsyncSuperRefineFunction => {
  const schema = z.object({
    isValid: z.boolean(),
    reason: z.string().optional(),
  })

  return async (value, ctx) => {
    const validated = await instructor.chat.completions.create({
      max_retries: 0,
      ...params,
      // @ts-expect-error - Type mismatch from zod/v3
      response_model: { schema, name: 'Validator' },
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'You are a world class validation model. Capable to determine if the following value is valid for the statement, if it is not, explain why and suggest a new value.',
        },
        {
          role: 'user',
          content: `Does \`${value}\` follow the rules: ${statement}`,
        },
      ],
    })
    if (!validated.isValid) {
      ctx.addIssue({
        // TODO: Update the `ZodIssueCode` deprecation with the following guidance
        // "Use the raw string literal codes instead, e.g. "invalid_type".
        code: z.ZodIssueCode.custom,
        message: validated?.reason ?? 'Unknown reason',
      })
    }
  }
}

export const moderationValidator = (client: InstructorClient<OpenAI>) => {
  return async (value: string, ctx: z.RefinementCtx) => {
    try {
      const response = await client.moderations.create({ input: value })
      const flaggedResults = response.results.filter((result) => result.flagged)

      if (flaggedResults.length > 0) {
        const flaggedCategories: string[] = []
        flaggedResults.forEach((result) => {
          Object.keys(result.categories).forEach((category) => {
            // @ts-expect-error - Will fix this later
            if (result.categories[category] === true) {
              flaggedCategories.push(category)
            }
          })
        })
        // TODO: Update the `ZodIssueCode` deprecation with the following guidance
        // "Use the raw string literal codes instead, e.g. "invalid_type".
        if (flaggedCategories.length > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Moderation error, \`${value}\` was flagged for ${flaggedCategories.join(', ')}`,
          })
        }
      }
    } catch (error) {
      // TODO: Update the `ZodIssueCode` deprecation with the following guidance
      // "Use the raw string literal codes instead, e.g. "invalid_type".
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unexpected error during moderation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }
}
