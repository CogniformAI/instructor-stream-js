/**
 * Integration example demonstrating the `maybe` schema wrapper with real API calls.
 *
 * This file shows how to use the `maybe` function to wrap schemas for extraction
 * tasks where the data may or may not be present in the provided context.
 *
 * Usage:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. Run: npx tsx examples/dsl/maybe-integration.ts
 */

import { maybe } from '@/dsl/maybe'
import Instructor from '@/instructor'
import OpenAI from 'openai'
import { z } from 'zod'

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
    model: 'gpt-4o',
    response_model: { schema: MaybeUserSchema, name: 'User' },
    max_retries: 3,
    seed: 1,
  })
}

async function runExamples() {
  console.log('=== Maybe Schema Integration Examples ===\n')

  // Example 1: Successful extraction
  try {
    console.log('Example 1: Extracting user from clear text')
    const user = await maybeExtractUser('Jason Liu is 30 years old')
    console.log('Result:', JSON.stringify(user, null, 2))
    console.log('Success:', !user.error && user.result?.name === 'Jason Liu')
    console.log()
  } catch (error) {
    console.error('Example 1 failed:', error)
    console.log()
  }

  // Example 2: Failed extraction (uncomment to test)
  /*
  try {
    console.log('Example 2: Extracting user from ambiguous text')
    const user = await maybeExtractUser('Unknown user mentioned somewhere')
    console.log('Result:', JSON.stringify(user, null, 2))
    console.log('Expected error:', user.error === true)
    console.log('Has message:', typeof user.message === 'string')
    console.log()
  } catch (error) {
    console.error('Example 2 failed:', error)
    console.log()
  }
  */

  // Example 3: Complex nested schema
  try {
    console.log('Example 3: Complex nested extraction')
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
      model: 'gpt-4o',
      response_model: { schema: MaybePersonSchema, name: 'Person' },
      max_retries: 2,
    })

    console.log('Result:', JSON.stringify(person, null, 2))
    console.log('Success:', !person.error && person.result?.name === 'John Smith')
    console.log()
  } catch (error) {
    console.error('Example 3 failed:', error)
    console.log()
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error)
}

export { maybeExtractUser, runExamples }
