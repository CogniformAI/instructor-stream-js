import OpenAI from 'openai'
import { RefinementCtx, z } from 'zod'
import { GenericClient } from '@/index.ts'
import { InstructorClient } from '../instructor.ts'

type AsyncSuperRefineFunction = (data: string, ctx: RefinementCtx) => Promise<void>

type ValidationResponse = {
  isValid: boolean
  reason?: string
}

type ModerationResponse = OpenAI.ModerationCreateResponse

/**
 * Creates a Zod schema for validation responses.
 *
 * The schema is a Zod object with two properties:
 *
 * - `isValid`: A boolean that indicates whether the input is valid.
 * - `reason`: An optional string that provides a reason why the input is invalid.
 *
 * @returns A Zod schema for validation responses.
 */
export const createValidationSchema = () => {
  return z.object({
    isValid: z.boolean(),
    reason: z.string().optional(),
  })
}

/**
 * Builds the messages that are sent to the AI model for validation.
 *
 * The first message is a system message that describes the task to the AI model.
 * The second message is the user message that contains the value to be validated.
 *
 * @param value The value to be validated.
 * @param statement The statement that describes the validation criteria.
 * @returns An array of two messages that are sent to the AI model.
 */
export const buildValidationMessages = (
  value: string,
  statement: string
): OpenAI.ChatCompletionMessageParam[] => {
  return [
    {
      role: 'system',
      content:
        'You are a world class validation model. You must respond with a JSON object containing two fields: "isValid" (boolean) and "reason" (optional string). The "isValid" field indicates whether the input follows the given rules. If "isValid" is false, provide a "reason" explaining why it failed validation.',
    },
    {
      role: 'user',
      content: `Validate if the following value follows the rules and respond with JSON format {"isValid": boolean, "reason": "optional explanation"}.\n\nValue to validate: \`${value}\`\nRules: ${statement}`,
    },
  ]
}

/**
 * Processes the validation response and adds an issue to the context if the validation fails.
 *
 * This function checks whether the given validation response indicates that the input
 * is invalid. If so, it adds a custom issue to the provided refinement context. The issue
 * includes a message detailing the reason for the invalidation, or a default message if no
 * reason is provided.
 *
 * @param validated - The validation response containing a boolean indicating validity
 * and an optional reason for invalidation.
 * @param ctx - The refinement context used to add issues if the validation fails.
 */
export const processValidationResponse = (
  validated: ValidationResponse,
  ctx: RefinementCtx
): void => {
  if (!validated.isValid) {
    ctx.issues.push({
            code: 'custom',
            message: validated?.reason ?? 'Unknown reason',
              input: ''
          })
  }
}

/**
 * Extracts an array of category names from the moderation response that were flagged as `true`.
 *
 * The response can contain multiple results, each with many category boolean flags.
 * This function collects the names of any categories that were flagged as `true` in
 * **all** results.
 *
 * @param response - The moderation response containing a list of results.
 * @returns An array of category names that were flagged in all results.
 */
export const extractFlaggedCategories = (response: ModerationResponse): string[] => {
  const flaggedCategories: string[] = []
  response.results.forEach((result) => {
    if (!result.flagged) return
    Object.entries(result.categories as unknown as Record<string, boolean>).forEach(
      ([category, isFlagged]) => {
        if (isFlagged) flaggedCategories.push(category)
      }
    )
  })
  return flaggedCategories
}

/**
 * Processes the moderation response and adds an issue to the context if the input
 * was flagged by the moderation model.
 *
 * The response can contain multiple results, each with many category boolean flags.
 * This function collects the names of any categories that were flagged as `true` in
 * **all** results and adds a custom issue to the provided refinement context. The
 * issue includes a message detailing the categories that were flagged, or a default
 * message if no categories were flagged.
 *
 * @param response - The moderation response containing a list of results.
 * @param value - The input value that was validated by the moderation model.
 * @param ctx - The refinement context used to add issues if the moderation fails.
 */
export const processModerationResponse = (
  response: ModerationResponse,
  value: string,
  ctx: RefinementCtx
): void => {
  const flaggedCategories = extractFlaggedCategories(response)
  if (flaggedCategories.length > 0) {
    ctx.issues.push({
            code: 'custom',
            message: `Moderation error, \`${value}\` was flagged for ${flaggedCategories.join(', ')}`,
              input: ''
          })
  }
}

/**
 * Handles errors that occur during the moderation process and adds a custom issue
 * to the provided refinement context.
 *
 * This function checks whether the provided error is an instance of the Error class.
 * If it is, the error message is extracted and used in the issue message. If the error
 * is not an instance of Error, a default message 'Unknown error' is used instead.
 *
 * @param error - The error that occurred during the moderation process, which can be
 * of any type.
 * @param ctx - The refinement context where the issue will be recorded if an error occurs.
 */

export const handleModerationError = (error: unknown, ctx: RefinementCtx): void => {
  ctx.issues.push({
        code: 'custom',
        message: `Unexpected error during moderation: ${error instanceof Error ? error.message : 'Unknown error'}`,
          input: ''
    })
}

/**
 * Creates a validator function that uses the AI model to validate a given input
 * value against a statement.
 *
 * The validator function takes a value and a refinement context as arguments,
 * and returns a promise that resolves to an object with a boolean `isValid`
 * property and an optional `reason` property with a string explaining why
 * the input is invalid.
 *
 * @param instructor - The instructor client instance.
 * @param statement - The statement that describes the validation criteria.
 * @param params - The options to be passed to the AI model.
 * @returns A validator function that takes a value and a refinement context
 * and returns a promise with the validation result.
 */
export const LLMValidator = <C extends GenericClient | OpenAI>(
  instructor: InstructorClient<C>,
  statement: string,
  params: Omit<OpenAI.ChatCompletionCreateParams, 'messages'>
): AsyncSuperRefineFunction => {
  return async (value, ctx) => {
    const schema = createValidationSchema()
    const messages = buildValidationMessages(value, statement)
    const completion = (await instructor.chat.completions.create({
      max_retries: 0,
      ...params,
      response_model: { schema, name: 'Validator' },
      stream: false,
      messages,
    })) as { data: ValidationResponse[]; _meta: unknown }
    const validated = completion.data[0]
    processValidationResponse(validated, ctx)
  }
}

/**
 * Creates a validator function that uses the AI model to validate a given input
 * value against OpenAI's content moderation model.
 *
 * The validator function takes a value and a refinement context as arguments,
 * and returns a promise that resolves to an object with a boolean `isValid`
 * property and an optional `reason` property with a string explaining why
 * the input is invalid.
 *
 * @param client - The instructor client instance.
 * @returns A validator function that takes a value and a refinement context
 * and returns a promise with the validation result.
 */
export const moderationValidator = (client: InstructorClient<OpenAI>) => {
  return async (value: string, ctx: z.RefinementCtx) => {
    try {
      const response = await client.moderations.create({ input: value })
      processModerationResponse(response, value, ctx)
    } catch (error) {
      handleModerationError(error, ctx)
    }
  }
}
