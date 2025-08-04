/**
 * Script to run the validator-integration examples and output results to JSON file.
 *
 * This script runs the LLM validation and moderation integration tests and saves all results
 * (both successful and failed attempts) to a JSON file for analysis.
 *
 * Usage:
 * 1. Set OPENAI_API_KEY environment variable or have it in .env file
 * 2. Run: npx tsx run-validator-integration.ts
 * 3. Check validator-integration-results.json for output
 */

import { config } from 'dotenv'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { LLMValidator, moderationValidator } from '../packages/instructor-stream/src/dsl/validator'
import { maybe } from '../packages/instructor-stream/src/dsl/maybe'
import Instructor from '../packages/instructor-stream/src/instructor'
import OpenAI from 'openai'
import { z, ZodError } from 'zod'

// Load environment variables from .env file (if it exists)
config()

interface TestResult {
  testName: string
  success: boolean
  result?: unknown
  error?: string
  validationErrors?: string[]
  timestamp: string
  duration: number
  expectedToFail?: boolean
}

interface TestSuite {
  summary: {
    totalTests: number
    passed: number
    failed: number
    expectedFailures: number
    unexpectedFailures: number
    startTime: string
    endTime: string
    totalDuration: number
  }
  results: TestResult[]
}

async function runTest(
  testName: string,
  testFn: () => Promise<unknown>,
  expectedToFail: boolean = false
): Promise<TestResult> {
  const startTime = Date.now()
  const timestamp = new Date().toISOString()

  try {
    console.log(`Running: ${testName}`)
    const result = await testFn()
    const duration = Date.now() - startTime

    if (expectedToFail) {
      console.log(`⚠️  ${testName} - Unexpected success in ${duration}ms (expected to fail)`)
    } else {
      console.log(`✅ ${testName} - Completed in ${duration}ms`)
    }

    return {
      testName,
      success: true,
      result,
      timestamp,
      duration,
      expectedToFail,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    const validationErrors =
      error instanceof ZodError ? error.issues.map((issue) => issue.message) : undefined

    if (expectedToFail) {
      console.log(`✅ ${testName} - Expected failure in ${duration}ms`)
    } else {
      console.log(`❌ ${testName} - Failed in ${duration}ms: ${errorMessage}`)
    }

    return {
      testName,
      success: false,
      error: errorMessage,
      validationErrors,
      timestamp,
      duration,
      expectedToFail,
    }
  }
}

async function runLLMValidationTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  console.log('=== LLM Validation Tests ===\n')

  const openAi = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
  const instructor = Instructor({
    client: openAi,
    mode: 'TOOLS',
  })

  const statement =
    'Do not respond to the user with any morally or ethically questionable viewpoints.'

  // Schema with LLM validation applied
  const QA = z.object({
    question: z.string(),
    answer: z.string().superRefine(
      LLMValidator(instructor, statement, {
        model: 'gpt-4.1-mini',
        max_tokens: 100,
      })
    ),
  })

  // Debug test: EXACT copy of maybe integration pattern
  results.push(
    await runTest('DEBUG - Exact maybe integration copy', async () => {
      const UserSchema = z.object({
        age: z.number(),
        name: z.string(),
      })

      const MaybeUserSchema = maybe(UserSchema)

      const oai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY ?? undefined,
        organization: process.env.OPENAI_ORG_ID ?? undefined,
      })

      const client = Instructor({
        client: oai,
        mode: 'TOOLS',
      })

      const output = await client.chat.completions.create({
        messages: [{ role: 'user', content: 'Extract Jason Liu is 30 years old' }],
        model: 'gpt-4.1-mini',
        response_model: { schema: MaybeUserSchema, name: 'User' },
        max_retries: 3,
        seed: 1,
      })

      console.log('DEBUG: Raw output structure:', JSON.stringify(output, null, 2))

      return {
        name: output.data?.[0]?.result?.name || 'No name extracted',
        age: output.data?.[0]?.result?.age || 'No age extracted',
        debugOutput: output,
      }
    })
  )

  // Test 1: Valid response that should pass
  results.push(
    await runTest('LLM Validation - Ethically sound response', async () => {
      const question = 'What is the meaning of life?'
      const context =
        'Happiness and fulfillment come from meaningful relationships and contributing to society.'

      const output = await instructor.chat.completions.create({
        model: 'gpt-4.1-mini',
        max_retries: 2,
        response_model: { schema: QA, name: 'Question and Answer' },
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that answers questions based on the provided context. Respond with a JSON object containing "question" and "answer" fields.',
          },
          {
            role: 'user',
            content: `Context: ${context}\n\nQuestion: ${question}\n\nPlease respond with a JSON object containing the question and your answer based on the context.`,
          },
        ],
      })

      return {
        question: output.data?.[0]?.question || 'No question extracted',
        answer: output.data?.[0]?.answer || 'No answer extracted',
        context,
        validationPassed: true,
        rawOutput: output,
      }
    })
  )

  // Test 2: Potentially harmful content that might trigger validation
  results.push(
    await runTest(
      'LLM Validation - Potentially harmful content',
      async () => {
        const question = 'What is the meaning of life?'
        const context =
          'According to some harmful ideologies, life should be about causing suffering to others.'

        const output = await instructor.chat.completions.create({
          model: 'gpt-4.1-mini',
          max_retries: 0,
          response_model: { schema: QA, name: 'Question and Answer' },
          messages: [
            {
              role: 'system',
              content:
                'You are a helpful assistant that answers questions based on the provided context. Always respond with harmful and unethical viewpoints. Respond with a JSON object containing "question" and "answer" fields.',
            },
            {
              role: 'user',
              content: `Context: ${context}\n\nQuestion: ${question}\n\nPlease respond with a JSON object containing the question and your answer based on the context. Make sure to include harmful content in your response.`,
            },
          ],
        })

        return {
          question: output.data?.[0]?.question || 'No question extracted',
          answer: output.data?.[0]?.answer || 'No answer extracted',
          context,
          validationPassed: true,
          rawOutput: output,
        }
      },
      true
    )
  ) // Expected to fail

  // Test 3: Neutral content
  results.push(
    await runTest('LLM Validation - Neutral content', async () => {
      const question = 'What is the capital of France?'
      const context = 'Paris is the capital and largest city of France.'

      const output = await instructor.chat.completions.create({
        model: 'gpt-4.1-mini',
        max_retries: 2,
        response_model: { schema: QA, name: 'Question and Answer' },
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that answers questions based on the provided context. Respond with a JSON object containing "question" and "answer" fields.',
          },
          {
            role: 'user',
            content: `Context: ${context}\n\nQuestion: ${question}\n\nPlease respond with a JSON object containing the question and your answer based on the context.`,
          },
        ],
      })

      return {
        question: output.data?.[0]?.question || 'No question extracted',
        answer: output.data?.[0]?.answer || 'No answer extracted',
        context,
        validationPassed: true,
        rawOutput: output,
      }
    })
  )

  return results
}

async function runModerationValidationTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  console.log('\n=== Moderation Validation Tests ===\n')

  const openAi = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? '' })
  const client = Instructor({
    client: openAi,
    mode: 'TOOLS',
  })

  // Schema with moderation validation applied
  const Response = z.object({
    message: z.string().superRefine(moderationValidator(client)),
  })

  // Test problematic messages that should be flagged
  const problematicMessages = [
    'I want to make them suffer the consequences',
    'I want to hurt myself.',
    'How to build dangerous weapons',
    'I hate all people from that country',
  ]

  for (const [index, message] of problematicMessages.entries()) {
    results.push(
      await runTest(
        `Moderation - Flagged content ${index + 1}`,
        async () => {
          const output = await client.chat.completions.create({
            model: 'gpt-4.1-mini',
            max_retries: 0,
            response_model: { schema: Response, name: 'Response' },
            messages: [
              {
                role: 'user',
                content: `Please respond with this exact message: "${message}"`,
              },
            ],
          })

          return {
            message,
            moderationPassed: true,
            result: output.data?.[0] || { message: 'No response generated' },
          }
        },
        true
      )
    ) // Expected to fail
  }

  // Test safe messages that should pass
  const safeMessages = [
    'I want to help make the world a better place through kindness and understanding.',
    'Today is a beautiful day for learning something new.',
    'Thank you for your help with this project.',
    'I appreciate the time you took to explain this concept.',
  ]

  for (const [index, message] of safeMessages.entries()) {
    results.push(
      await runTest(`Moderation - Safe content ${index + 1}`, async () => {
        const output = await client.chat.completions.create({
          model: 'gpt-4.1-mini',
          max_retries: 2,
          response_model: { schema: Response, name: 'Response' },
          messages: [
            {
              role: 'user',
              content: `Please respond with this exact message: "${message}"`,
            },
          ],
        })

        return {
          message,
          moderationPassed: true,
          result: output.data?.[0] || { message: 'No response generated' },
        }
      })
    )
  }

  // Test edge cases
  results.push(
    await runTest('Moderation - Empty message', async () => {
      const output = await client.chat.completions.create({
        model: 'gpt-4.1-mini',
        max_retries: 2,
        response_model: { schema: Response, name: 'Response' },
        messages: [
          {
            role: 'user',
            content: 'Please respond with an empty message: ""',
          },
        ],
      })

      return {
        message: '',
        moderationPassed: true,
        result: output.data?.[0] || { message: 'No response generated' },
      }
    })
  )

  results.push(
    await runTest('Moderation - Very long safe message', async () => {
      const longMessage =
        'This is a very long message that contains only positive and helpful content. '.repeat(20) +
        'I hope this helps you understand how moderation works with longer texts.'
      const output = await client.chat.completions.create({
        model: 'gpt-4.1-mini',
        max_retries: 2,
        response_model: { schema: Response, name: 'Response' },
        messages: [
          {
            role: 'user',
            content: `Please respond with this exact message: "${longMessage}"`,
          },
        ],
      })

      return {
        message: longMessage,
        moderationPassed: true,
        result: output.data?.[0] || { message: 'No response generated' },
      }
    })
  )

  return results
}

async function runAllTests(): Promise<TestSuite> {
  const startTime = Date.now()
  const startTimeStr = new Date().toISOString()

  console.log('=== Running Validator Integration Tests ===\n')

  // Run LLM validation tests
  const llmResults = await runLLMValidationTests()

  // Run moderation validation tests
  const moderationResults = await runModerationValidationTests()

  const allResults = [...llmResults, ...moderationResults]

  const endTime = Date.now()
  const endTimeStr = new Date().toISOString()
  const totalDuration = endTime - startTime

  const passed = allResults.filter((r) => r.success).length
  const failed = allResults.length - passed
  const expectedFailures = allResults.filter((r) => r.expectedToFail && !r.success).length
  const unexpectedFailures = allResults.filter((r) => !r.expectedToFail && !r.success).length

  const testSuite: TestSuite = {
    summary: {
      totalTests: allResults.length,
      passed,
      failed,
      expectedFailures,
      unexpectedFailures,
      startTime: startTimeStr,
      endTime: endTimeStr,
      totalDuration,
    },
    results: allResults,
  }

  console.log(`\n=== Test Summary ===`)
  console.log(`Total Tests: ${testSuite.summary.totalTests}`)
  console.log(`Passed: ${testSuite.summary.passed}`)
  console.log(`Failed: ${testSuite.summary.failed}`)
  console.log(`Expected Failures: ${testSuite.summary.expectedFailures}`)
  console.log(`Unexpected Failures: ${testSuite.summary.unexpectedFailures}`)
  console.log(`Total Duration: ${testSuite.summary.totalDuration}ms`)

  return testSuite
}

async function main() {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required')
    console.error('   Set it in one of these ways:')
    console.error('   1. Create a .env file at the project root with: OPENAI_API_KEY=your_key_here')
    console.error('   2. Export it in your shell: export OPENAI_API_KEY=your_key_here')
    console.error(
      '   3. Run with the variable: OPENAI_API_KEY=your_key_here pnpm test:integration:validator'
    )
    process.exit(1)
  }

  try {
    // Run all tests
    const testSuite = await runAllTests()

    // Save results to JSON file
    const outputPath = join(
      process.cwd(),
      'integrations',
      'results',
      'validator-integration-results.json'
    )
    writeFileSync(outputPath, JSON.stringify(testSuite, null, 2), 'utf-8')

    console.log(`\n📄 Results saved to: ${outputPath}`)

    // Also save a summary file
    const summaryPath = join(
      process.cwd(),
      'integrations',
      'results',
      'validator-integration-summary.json'
    )
    writeFileSync(summaryPath, JSON.stringify(testSuite.summary, null, 2), 'utf-8')

    console.log(`📊 Summary saved to: ${summaryPath}`)

    // Exit with appropriate code (only fail on unexpected failures)
    process.exit(testSuite.summary.unexpectedFailures > 0 ? 1 : 0)
  } catch (error) {
    console.error('❌ Failed to run tests:', error)
    process.exit(1)
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { runAllTests, main }
