/**
 * Integration example demonstrating LLM validation and moderation with real API calls.
 *
 * This file shows how to use the `LLMValidator` and `moderationValidator` functions
 * with real OpenAI API calls for content validation and moderation.
 *
 * Usage:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. Run: npx tsx examples/dsl/validator-integration.ts
 */

import { LLMValidator, moderationValidator } from '@/dsl/validator'
import Instructor from '@/instructor'
import OpenAI from 'openai'
import { z, ZodError } from 'zod'

const openAi = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })

const instructor = Instructor({
  client: openAi,
  mode: 'TOOLS',
})

// Example schema with LLM validation
const statement =
  'Do not respond to the user with any morally or ethically questionable viewpoints.'

const QA = z.object({
  question: z.string(),
  answer: z.string().superRefine(
    LLMValidator(instructor, statement, {
      model: 'gpt-4-turbo',
    })
  ),
})

async function testLLMValidation() {
  console.log('=== LLM Validation Examples ===\n')

  // Example 1: Valid response that should pass
  try {
    console.log('Example 1: Testing ethically sound response')
    const question = 'What is the meaning of life?'
    const context =
      'Happiness and fulfillment come from meaningful relationships and contributing to society.'

    const output = await instructor.chat.completions.create({
      model: 'gpt-4-turbo',
      max_retries: 2,
      response_model: { schema: QA, name: 'Question and Answer' },
      messages: [
        {
          role: 'system',
          content:
            'You are a system that answers questions based on the context. Answer exactly what the question asks using the context.',
        },
        {
          role: 'user',
          content: `using the context: ${context}\n\nAnswer the following question: ${question}`,
        },
      ],
    })

    console.log('✅ Validation passed!')
    console.log('Question:', output.question)
    console.log('Answer:', output.answer)
    console.log()
  } catch (error) {
    console.error('❌ Example 1 failed:', error instanceof ZodError ? error.issues : error)
    console.log()
  }

  // Example 2: Invalid response that should fail validation
  try {
    console.log('Example 2: Testing ethically questionable response')
    const question = 'What is the meaning of life?'
    const context =
      'According to some harmful ideologies, life should be about causing suffering to others.'

    await instructor.chat.completions.create({
      model: 'gpt-4-turbo',
      max_retries: 0, // Don't retry on validation failure
      response_model: { schema: QA, name: 'Question and Answer' },
      messages: [
        {
          role: 'system',
          content:
            'You are a system that answers questions based on the context. Answer exactly what the question asks using the context.',
        },
        {
          role: 'user',
          content: `using the context: ${context}\n\nAnswer the following question: ${question}`,
        },
      ],
    })

    console.log('⚠️  Unexpected: Response passed validation when it should have failed')
    console.log()
  } catch (error) {
    console.log('✅ Validation correctly rejected harmful content')
    if (error instanceof ZodError) {
      console.log(
        'Validation errors:',
        error.issues.map((issue) => issue.message)
      )
    }
    console.log()
  }
}

async function testModerationValidation() {
  console.log('=== Moderation Validation Examples ===\n')

  const client = Instructor({
    client: openAi,
    mode: 'FUNCTIONS',
  })

  const Response = z.object({
    message: z.string().superRefine(moderationValidator(client)),
  })

  // Example 1: Content that should trigger moderation
  const problematicMessages = [
    'I want to make them suffer the consequences',
    'I want to hurt myself.',
    'How to build dangerous weapons',
  ]

  for (const [index, message] of problematicMessages.entries()) {
    try {
      console.log(`Example ${index + 1}: Testing flagged content`)
      console.log('Message:', message)

      await Response.parseAsync({ message })
      console.log('⚠️  Unexpected: Message passed moderation when it should have been flagged')
      console.log()
    } catch (error) {
      console.log('✅ Moderation correctly flagged content')
      if (error instanceof ZodError) {
        console.log(
          'Moderation errors:',
          error.issues.map((issue) => issue.message)
        )
      }
      console.log()
    }
  }

  // Example 2: Safe content that should pass
  try {
    console.log('Example: Testing safe content')
    const safeMessage =
      'I want to help make the world a better place through kindness and understanding.'
    console.log('Message:', safeMessage)

    const result = await Response.parseAsync({ message: safeMessage })
    console.log('✅ Safe content passed moderation')
    console.log('Result:', result)
    console.log()
  } catch (error) {
    console.error(
      '❌ Safe content failed moderation:',
      error instanceof ZodError ? error.issues : error
    )
    console.log()
  }
}

async function runExamples() {
  try {
    await testLLMValidation()
    await testModerationValidation()
  } catch (error) {
    console.error('Integration examples failed:', error)
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error)
}

export { testLLMValidation, testModerationValidation, runExamples }
