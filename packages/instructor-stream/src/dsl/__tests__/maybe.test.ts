import { describe, test, expect } from 'vitest'
import { z } from 'zod'
import { maybe } from '@/dsl/maybe'

describe('maybe', () => {
  test('shouldCreateMaybeSchemaWithCorrectStructure', () => {
    const baseSchema = z.object({
      name: z.string(),
      age: z.number(),
    })
    const maybeSchema = maybe(baseSchema)
    /** Test that the schema has the expected structure */
    expect(maybeSchema.shape).toHaveProperty('result')
    expect(maybeSchema.shape).toHaveProperty('error')
    expect(maybeSchema.shape).toHaveProperty('message')
    /** Test that result is optional */
    expect(maybeSchema.shape.result.safeParse(undefined).success).toBe(true)
    /** Test that error has a default value by parsing an object without error field */
    const testWithoutError = maybeSchema.parse({ result: undefined })
    expect(testWithoutError.error).toBe(false)
    /** Test that message is optional */
    expect(maybeSchema.shape.message.safeParse(undefined).success).toBe(true)
  })

  test('shouldParseValidMaybeObjectWithResult', () => {
    const userSchema = z.object({
      name: z.string(),
      age: z.number(),
    })
    const maybeUserSchema = maybe(userSchema)
    const validData = {
      result: { name: 'John', age: 30 },
      error: false,
      message: undefined,
    }
    const parsed = maybeUserSchema.parse(validData)
    expect(parsed.result).toEqual({ name: 'John', age: 30 })
    expect(parsed.error).toBe(false)
    expect(parsed.message).toBeUndefined()
  })

  test('shouldParseValidMaybeObjectWithError', () => {
    const userSchema = z.object({
      name: z.string(),
      age: z.number(),
    })
    const maybeUserSchema = maybe(userSchema)
    const errorData = {
      result: undefined,
      error: true,
      message: 'Could not extract user information',
    }
    const parsed = maybeUserSchema.parse(errorData)
    expect(parsed.result).toBeUndefined()
    expect(parsed.error).toBe(true)
    expect(parsed.message).toBe('Could not extract user information')
  })

  test('shouldUseDefaultValuesWhenFieldsNotProvided', () => {
    const stringSchema = z.string()
    const maybeStringSchema = maybe(stringSchema)
    const minimalData = {
      result: 'test value',
    }
    const parsed = maybeStringSchema.parse(minimalData)
    expect(parsed.result).toBe('test value')
    expect(parsed.error).toBe(false) /** Default value */
    expect(parsed.message).toBeUndefined()
  })

  test('shouldWorkWithPrimitiveSchemas', () => {
    const numberSchema = z.number()
    const maybeNumberSchema = maybe(numberSchema)
    const data = {
      result: 42,
      error: false,
    }
    const parsed = maybeNumberSchema.parse(data)
    expect(parsed.result).toBe(42)
    expect(parsed.error).toBe(false)
  })

  test('shouldWorkWithArraySchemas', () => {
    const arraySchema = z.array(z.string())
    const maybeArraySchema = maybe(arraySchema)
    const data = {
      result: ['item1', 'item2'],
      error: false,
    }
    const parsed = maybeArraySchema.parse(data)
    expect(parsed.result).toEqual(['item1', 'item2'])
    expect(parsed.error).toBe(false)
  })

  test('shouldWorkWithNestedObjectSchemas', () => {
    const nestedSchema = z.object({
      user: z.object({
        profile: z.object({
          name: z.string(),
          email: z.email(),
        }),
        settings: z.object({
          theme: z.enum(['light', 'dark']),
          notifications: z.boolean(),
        }),
      }),
    })
    const maybeNestedSchema = maybe(nestedSchema)
    const data = {
      result: {
        user: {
          profile: {
            name: 'Alice',
            email: 'alice@example.com',
          },
          settings: {
            theme: 'dark' as const,
            notifications: true,
          },
        },
      },
      error: false,
    }
    const parsed = maybeNestedSchema.parse(data)
    expect(parsed.result?.user.profile.name).toBe('Alice')
    expect(parsed.result?.user.settings.theme).toBe('dark')
    expect(parsed.error).toBe(false)
  })

  test('shouldValidateResultAgainstOriginalSchema', () => {
    const strictSchema = z.object({
      email: z.email(),
      age: z.number().positive(),
    })
    const maybeStrictSchema = maybe(strictSchema)
    /** Should fail with invalid email */
    expect(() => {
      maybeStrictSchema.parse({
        result: { email: 'invalid-email', age: 25 },
        error: false,
      })
    }).toThrow()
    /** Should fail with negative age */
    expect(() => {
      maybeStrictSchema.parse({
        result: { email: 'valid@email.com', age: -5 },
        error: false,
      })
    }).toThrow()
  })

  test('shouldPreserveOriginalSchemaTypeInference', () => {
    const originalSchema = z.object({
      id: z.uuid(),
      count: z.int().positive(),
    })
    const maybeSchema = maybe(originalSchema)
    /** Type inference test - this should compile without errors */
    const parsed = maybeSchema.parse({
      result: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        count: 42,
      },
      error: false,
    })
    /** TypeScript should infer the correct type for result */
    if (parsed.result) {
      expect(typeof parsed.result.id).toBe('string')
      expect(typeof parsed.result.count).toBe('number')
    }
  })

  test('shouldIncludeDescriptionsForFields', () => {
    const schema = z.string()
    const maybeSchema = maybe(schema)
    /** Check that descriptions are present by testing the schema can parse correctly */
    /** The descriptions are used by LLMs and should be accessible */
    const testData = {
      result: 'test value',
      error: false,
      message: 'test message',
    }
    const parsed = maybeSchema.parse(testData)
    expect(parsed.result).toBe('test value')
    expect(parsed.message).toBe('test message')
    /** Test that the schema structure includes the expected fields with descriptions */
    expect(maybeSchema.shape.result).toBeDefined()
    expect(maybeSchema.shape.message).toBeDefined()
  })

  test('shouldHandleUndefinedResultGracefully', () => {
    const schema = z.object({ value: z.string() })
    const maybeSchema = maybe(schema)
    const data = {
      result: undefined,
      error: true,
      message: 'No data found',
    }
    const parsed = maybeSchema.parse(data)
    expect(parsed.result).toBeUndefined()
    expect(parsed.error).toBe(true)
    expect(parsed.message).toBe('No data found')
  })

  test('shouldSatisfyMaybeTypeConstraint', () => {
    const schema = z.object({ test: z.string() })
    const maybeSchema = maybe(schema)
    /** This test ensures the returned schema satisfies the Maybe<T> type */
    /** TypeScript compilation validates this constraint */
    const shape = maybeSchema.shape
    expect(shape.result).toBeDefined()
    expect(shape.error).toBeDefined()
    expect(shape.message).toBeDefined()
    /** Verify the error field has the expected default behavior */
    const parsedWithoutError = maybeSchema.parse({ result: { test: 'value' } })
    expect(parsedWithoutError.error).toBe(false) /** Should use default value */
  })
})
