/**
 * Script to run the maybe-integration examples and output results to JSON file.
 *
 * This script runs the maybe schema integration tests and saves all results
 * (both successful and failed attempts) to a JSON file for analysis.
 *
 * Usage:
 * 1. Set OPENAI_API_KEY environment variable or have it in .env file
 * 2. Run: npx tsx run-maybe-integration.ts
 * 3. Check maybe-integration-results.json for output
 */

import { config } from 'dotenv'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { maybe } from '../packages/instructor-stream/src/dsl/maybe'
import Instructor from '../packages/instructor-stream/src/instructor'
import OpenAI from 'openai'
import { z } from 'zod'

// Load environment variables from .env file (if it exists)
config()

interface TestResult {
  testName: string
  success: boolean
  result?: unknown
  error?: string
  timestamp: string
  duration: number
}

interface TestSuite {
  summary: {
    totalTests: number
    passed: number
    failed: number
    startTime: string
    endTime: string
    totalDuration: number
  }
  results: TestResult[]
}

async function maybeExtractUser(content: string) {
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

  return await client.chat.completions.create({
    messages: [{ role: 'user', content: 'Extract ' + content }],
    model: 'gpt-4.1-mini',
    response_model: { schema: MaybeUserSchema, name: 'User' },
    max_retries: 3,
    seed: 1,
  })
}

async function runTest(testName: string, testFn: () => Promise<unknown>): Promise<TestResult> {
  const startTime = Date.now()
  const timestamp = new Date().toISOString()

  try {
    console.log(`Running: ${testName}`)
    const result = await testFn()
    const duration = Date.now() - startTime

    console.log(`✅ ${testName} - Completed in ${duration}ms`)

    return {
      testName,
      success: true,
      result,
      timestamp,
      duration,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.log(`❌ ${testName} - Failed in ${duration}ms: ${errorMessage}`)

    return {
      testName,
      success: false,
      error: errorMessage,
      timestamp,
      duration,
    }
  }
}

async function runAllTests(): Promise<TestSuite> {
  const startTime = Date.now()
  const startTimeStr = new Date().toISOString()
  const results: TestResult[] = []

  console.log('=== Running Maybe Schema Integration Tests ===\n')

  // Test 1: Successful extraction
  results.push(
    await runTest('Extract user from clear text', async () => {
      const user = await maybeExtractUser('Jason Liu is 30 years old')
      return {
        extractedData: user,
        isSuccess: user._meta._type !== 'error' && user.data[0]?.result?.name === 'Jason Liu',
        extractedName: user.data[0]?.result?.name,
        extractedAge: user.data[0]?.result?.age,
      }
    })
  )

  // Test 2: Failed extraction (ambiguous text)
  results.push(
    await runTest('Extract user from ambiguous text', async () => {
      const user = await maybeExtractUser('Unknown user mentioned somewhere')
      return {
        extractedData: user,
        isError: user._meta._type === 'error',
        hasMessage: typeof user.data[0]?.message === 'string',
      }
    })
  )

  // Test 3: Complex nested schema
  results.push(
    await runTest('Complex nested extraction', async () => {
      const PersonSchema = z.object({
        name: z.string(),
        contact: z.object({
          email: z.string().email(),
          phone: z.string().optional(),
        }),
        age: z.number(),
      })

      const MaybePersonSchema = maybe(PersonSchema)

      const oai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY ?? undefined,
      })

      const client = Instructor({
        client: oai,
        mode: 'TOOLS',
      })

      const person = await client.chat.completions.create({
        messages: [
          {
            role: 'user',
            content:
              'Extract person info: John Smith, age 25, email john@example.com, phone 555-1234',
          },
        ],
        model: 'gpt-4.1-mini',
        response_model: { schema: MaybePersonSchema, name: 'Person' },
        max_retries: 2,
      })

      return {
        extractedData: person,
        isSuccess: person._meta._type !== 'error' && person.data[0]?.result?.name === 'John Smith',
        extractedPerson: person.data[0]?.result,
      }
    })
  )

  // Test 4: Edge case - empty content
  results.push(
    await runTest('Extract from empty content', async () => {
      const user = await maybeExtractUser('')
      return {
        extractedData: user,
        isError: user._meta._type === 'error',
      }
    })
  )

  // Test 5: Edge case - numbers only
  results.push(
    await runTest('Extract from numbers only', async () => {
      const user = await maybeExtractUser('25 30 40')
      return {
        extractedData: user,
        isError: user._meta._type === 'error',
      }
    })
  )

  // Test 6: Partial information
  results.push(
    await runTest('Extract from partial information', async () => {
      const user = await maybeExtractUser('Someone named Alice but no age mentioned')
      return {
        extractedData: user,
        isPartialSuccess: user._meta._type !== 'error' && user.data[0]?.result?.name === 'Alice',
        extractedName: user.data[0]?.result?.name,
      }
    })
  )

  const endTime = Date.now()
  const endTimeStr = new Date().toISOString()
  const totalDuration = endTime - startTime
  const passed = results.filter((r) => r.success).length
  const failed = results.length - passed

  const testSuite: TestSuite = {
    summary: {
      totalTests: results.length,
      passed,
      failed,
      startTime: startTimeStr,
      endTime: endTimeStr,
      totalDuration,
    },
    results,
  }

  console.log(`\n=== Test Summary ===`)
  console.log(`Total Tests: ${testSuite.summary.totalTests}`)
  console.log(`Passed: ${testSuite.summary.passed}`)
  console.log(`Failed: ${testSuite.summary.failed}`)
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
      '   3. Run with the variable: OPENAI_API_KEY=your_key_here pnpm test:integration:maybe'
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
      'maybe-integration-results.json'
    )
    writeFileSync(outputPath, JSON.stringify(testSuite, null, 2), 'utf-8')

    console.log(`\n📄 Results saved to: ${outputPath}`)

    // Also save a summary file
    const summaryPath = join(
      process.cwd(),
      'integrations',
      'results',
      'maybe-integration-summary.json'
    )
    writeFileSync(summaryPath, JSON.stringify(testSuite.summary, null, 2), 'utf-8')

    console.log(`📊 Summary saved to: ${summaryPath}`)

    // Exit with appropriate code
    process.exit(testSuite.summary.failed > 0 ? 1 : 0)
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
