import { describe, test, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import {
  createValidationSchema,
  buildValidationMessages,
  processValidationResponse,
  extractFlaggedCategories,
  processModerationResponse,
  handleModerationError,
  LLMValidator,
  moderationValidator,
} from '@/dsl/validator'
import type { InstructorClient } from '@/instructor'
import type OpenAI from 'openai'

interface MockValidationCtx {
  addIssue: ReturnType<typeof vi.fn>
}

interface MockInstructorClient {
  chat: {
    completions: {
      create: ReturnType<typeof vi.fn>
    }
  }
}

interface MockOpenAIClient {
  moderations: {
    create: ReturnType<typeof vi.fn>
  }
}

interface MockModerationResult {
  flagged: boolean
  categories: Record<string, boolean>
}

interface MockModerationResponse {
  results: MockModerationResult[]
}

describe('validator', () => {
  describe('createValidationSchema', () => {
    test('shouldCreateValidationSchemaWithCorrectStructure', () => {
      const schema = createValidationSchema()
      expect(schema.shape).toHaveProperty('isValid')
      expect(schema.shape).toHaveProperty('reason')
      /** Test that isValid is required boolean */
      expect(schema.shape.isValid instanceof z.ZodBoolean).toBe(true)
      /** Test that reason is optional string */
      expect(schema.shape.reason.safeParse(undefined).success).toBe(true)
    })

    test('shouldParseValidValidationResponse', () => {
      const schema = createValidationSchema()
      const validResponse = {
        isValid: true,
        reason: 'The input follows all rules',
      }
      const parsed = schema.parse(validResponse)
      expect(parsed.isValid).toBe(true)
      expect(parsed.reason).toBe('The input follows all rules')
    })

    test('shouldParseInvalidValidationResponseWithoutReason', () => {
      const schema = createValidationSchema()
      const invalidResponse = {
        isValid: false,
      }
      const parsed = schema.parse(invalidResponse)
      expect(parsed.isValid).toBe(false)
      expect(parsed.reason).toBeUndefined()
    })
  })

  describe('buildValidationMessages', () => {
    test('shouldBuildCorrectMessagesArray', () => {
      const value = 'test input'
      const statement = 'must be polite and professional'
      const messages = buildValidationMessages(value, statement)
      expect(messages).toHaveLength(2)
      /** Check system message */
      expect(messages[0].role).toBe('system')
      expect(messages[0].content).toContain('world class validation model')
      /** Check user message */
      expect(messages[1].role).toBe('user')
      expect(messages[1].content).toContain(value)
      expect(messages[1].content).toContain(statement)
      expect(messages[1].content).toBe(
        `Validate if the following value follows the rules and respond with JSON format {"isValid": boolean, "reason": "optional explanation"}.\n\nValue to validate: \`${value}\`\nRules: ${statement}`
      )
    })

    test('shouldHandleSpecialCharactersInValue', () => {
      const value = 'test with "quotes" and \\backslashes\\'
      const statement = 'must be safe'
      const messages = buildValidationMessages(value, statement)
      expect(messages[1].content).toContain(value)
      expect(messages[1].content).toBe(
        `Validate if the following value follows the rules and respond with JSON format {"isValid": boolean, "reason": "optional explanation"}.\n\nValue to validate: \`${value}\`\nRules: ${statement}`
      )
    })

    test('shouldHandleEmptyValues', () => {
      const value = ''
      const statement = ''
      const messages = buildValidationMessages(value, statement)
      expect(messages).toHaveLength(2)
      expect(messages[1].content).toBe(
        'Validate if the following value follows the rules and respond with JSON format {"isValid": boolean, "reason": "optional explanation"}.\n\nValue to validate: ``\nRules: '
      )
    })
  })

  describe('processValidationResponse', () => {
    let mockCtx: MockValidationCtx
    beforeEach(() => {
      mockCtx = {
        addIssue: vi.fn(),
      }
    })

    test('shouldNotAddIssueWhenValidationIsValid', () => {
      const validResponse = {
        isValid: true,
        reason: 'Input is acceptable',
      }
      // @ts-expect-error - mocks
      processValidationResponse(validResponse, mockCtx)
      expect(mockCtx.addIssue).not.toHaveBeenCalled()
    })

    test('shouldAddIssueWhenValidationIsInvalid', () => {
      const invalidResponse = {
        isValid: false,
        reason: 'Input contains inappropriate content',
      }
      // @ts-expect-error - mocks
      processValidationResponse(invalidResponse, mockCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: 'Input contains inappropriate content',
      })
    })

    test('shouldUseDefaultMessageWhenReasonIsMissing', () => {
      const invalidResponse = {
        isValid: false,
      }
      // @ts-expect-error - mocks
      processValidationResponse(invalidResponse, mockCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: 'Unknown reason',
      })
    })

    test('shouldUseDefaultMessageWhenReasonIsUndefined', () => {
      const invalidResponse = {
        isValid: false,
        reason: undefined,
      }
      // @ts-expect-error - mocks
      processValidationResponse(invalidResponse, mockCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: 'Unknown reason',
      })
    })
  })

  describe('extractFlaggedCategories', () => {
    test('shouldReturnEmptyArrayWhenNoFlaggedResults', () => {
      const response = {
        results: [
          {
            flagged: false,
            categories: {
              hate: false,
              violence: false,
              sexual: false,
            },
          },
        ],
      }
      const categories = extractFlaggedCategories(
        response as unknown as OpenAI.ModerationCreateResponse
      )
      expect(categories).toEqual([])
    })

    test('shouldExtractFlaggedCategoriesFromSingleResult', () => {
      const response: MockModerationResponse = {
        results: [
          {
            flagged: true,
            categories: {
              hate: true,
              violence: false,
              sexual: true,
              harassment: false,
            },
          },
        ],
      }
      const categories = extractFlaggedCategories(
        response as unknown as OpenAI.ModerationCreateResponse
      )
      expect(categories).toEqual(['hate', 'sexual'])
    })

    test('shouldExtractFlaggedCategoriesFromMultipleResults', () => {
      const response = {
        results: [
          {
            flagged: true,
            categories: {
              hate: true,
              violence: false,
              sexual: false,
              harassment: false,
              'self-harm': false,
            },
          },
          {
            flagged: false,
            categories: {
              hate: false,
              violence: false,
              sexual: true,
              harassment: false,
              'self-harm': false,
            },
          },
          {
            flagged: true,
            categories: {
              hate: false,
              violence: false,
              sexual: false,
              harassment: true,
              'self-harm': false,
            },
          },
        ],
      }
      const categories = extractFlaggedCategories(
        response as unknown as OpenAI.ModerationCreateResponse
      )
      expect(categories).toEqual(['hate', 'harassment'])
    })

    test('shouldHandleEmptyResults', () => {
      const response = {
        results: [],
      }
      const categories = extractFlaggedCategories(
        response as unknown as OpenAI.ModerationCreateResponse
      )
      expect(categories).toEqual([])
    })

    test('shouldHandleResultsWithEmptyCategories', () => {
      const response = {
        results: [
          {
            flagged: true,
            categories: {},
          },
        ],
      }
      const categories = extractFlaggedCategories(
        response as unknown as OpenAI.ModerationCreateResponse
      )
      expect(categories).toEqual([])
    })
  })

  describe('processModerationResponse', () => {
    let mockCtx: MockValidationCtx
    beforeEach(() => {
      mockCtx = {
        addIssue: vi.fn(),
      }
    })

    test('shouldNotAddIssueWhenNoFlaggedCategories', () => {
      const response = {
        results: [
          {
            flagged: false,
            categories: {
              hate: false,
              violence: false,
            },
          },
        ],
      }
      processModerationResponse(
        response as unknown as OpenAI.ModerationCreateResponse,
        'test input',
        mockCtx as unknown as z.RefinementCtx
      )
      expect(mockCtx.addIssue).not.toHaveBeenCalled()
    })

    test('shouldAddIssueWhenCategoriesAreFlagged', () => {
      const response = {
        results: [
          {
            flagged: true,
            categories: {
              hate: true,
              violence: false,
              harassment: true,
            },
          },
        ],
      }
      const testValue = 'inappropriate content'
      processModerationResponse(
        response as unknown as OpenAI.ModerationCreateResponse,
        testValue,
        mockCtx as unknown as z.RefinementCtx
      )
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: `Moderation error, \`${testValue}\` was flagged for hate, harassment`,
      })
    })

    test('shouldHandleMultipleFlaggedResults', () => {
      const response = {
        results: [
          {
            flagged: true,
            categories: {
              hate: true,
              violence: false,
              sexual: false,
            },
          },
          {
            flagged: true,
            categories: {
              hate: false,
              violence: true,
              sexual: true,
            },
          },
        ],
      }
      const testValue = 'harmful content'
      processModerationResponse(
        response as unknown as OpenAI.ModerationCreateResponse,
        testValue,
        mockCtx as unknown as z.RefinementCtx
      )
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: `Moderation error, \`${testValue}\` was flagged for hate, violence, sexual`,
      })
    })
  })

  describe('handleModerationError', () => {
    let mockCtx: MockValidationCtx
    beforeEach(() => {
      mockCtx = {
        addIssue: vi.fn(),
      }
    })

    test('shouldHandleErrorWithMessage', () => {
      const error = new Error('API connection failed')
      handleModerationError(error, mockCtx as unknown as z.RefinementCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: 'Unexpected error during moderation: API connection failed',
      })
    })

    test('shouldHandleNonErrorObjects', () => {
      const error = 'String error message'
      handleModerationError(error, mockCtx as unknown as z.RefinementCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: 'Unexpected error during moderation: Unknown error',
      })
    })

    test('shouldHandleNullError', () => {
      const error = null
      handleModerationError(error, mockCtx as unknown as z.RefinementCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: 'Unexpected error during moderation: Unknown error',
      })
    })

    test('shouldHandleUndefinedError', () => {
      const error = undefined
      handleModerationError(error, mockCtx as unknown as z.RefinementCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: 'Unexpected error during moderation: Unknown error',
      })
    })

    test('shouldHandleObjectWithoutMessage', () => {
      const error = { status: 500, code: 'INTERNAL_ERROR' }
      handleModerationError(error, mockCtx as unknown as z.RefinementCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: 'Unexpected error during moderation: Unknown error',
      })
    })
  })

  describe('LLMValidator', () => {
    test('shouldReturnAsyncSuperRefineFunction', () => {
      const mockInstructor = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              isValid: true,
              reason: 'Input is valid',
            }),
          },
        },
      }
      const statement = 'must be polite'
      const params = { model: 'gpt-4.1-mini' }
      // @ts-expect-error - mocks
      const validator = LLMValidator(mockInstructor, statement, params)
      expect(typeof validator).toBe('function')
      expect(validator.constructor.name).toBe('AsyncFunction')
    })

    test('shouldCallInstructorWithCorrectParameters', async () => {
      const mockInstructor: MockInstructorClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              data: [
                {
                  isValid: true,
                  reason: 'Input is valid',
                },
              ],
              _meta: {},
            }),
          },
        },
      }
      const mockCtx: MockValidationCtx = {
        addIssue: vi.fn(),
      }
      const statement = 'must be polite'
      const params = { model: 'gpt-4.1-mini' }
      const value = 'test input'
      const validator = LLMValidator(
        mockInstructor as unknown as InstructorClient<OpenAI>,
        statement,
        params
      )
      await validator(value, mockCtx as unknown as z.RefinementCtx)
      expect(mockInstructor.chat.completions.create).toHaveBeenCalledWith({
        max_retries: 0,
        model: 'gpt-4.1-mini',
        response_model: {
          schema: expect.any(Object),
          name: 'Validator',
        },
        stream: false,
        messages: [
          {
            role: 'system',
            content: expect.stringContaining('world class validation model'),
          },
          {
            role: 'user',
            content: `Validate if the following value follows the rules and respond with JSON format {"isValid": boolean, "reason": "optional explanation"}.\n\nValue to validate: \`${value}\`\nRules: ${statement}`,
          },
        ],
      })
    })

    test('shouldProcessValidationResponseCorrectly', async () => {
      const mockInstructor = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              data: [
                {
                  isValid: false,
                  reason: 'Input is inappropriate',
                },
              ],
              _meta: {},
            }),
          },
        },
      }
      const mockCtx: MockValidationCtx = {
        addIssue: vi.fn(),
      }
      const validator = LLMValidator(
        mockInstructor as unknown as InstructorClient<OpenAI>,
        'test statement',
        { model: 'gpt-4.1-mini' }
      )
      await validator('test value', mockCtx as unknown as z.RefinementCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: 'Input is inappropriate',
      })
    })
  })

  describe('moderationValidator', () => {
    test('shouldReturnAsyncValidatorFunction', () => {
      const mockClient: MockOpenAIClient = {
        moderations: {
          create: vi.fn(),
        },
      }
      const validator = moderationValidator(mockClient as unknown as InstructorClient<OpenAI>)
      expect(typeof validator).toBe('function')
      expect(validator.constructor.name).toBe('AsyncFunction')
    })

    test('shouldCallModerationAPIWithCorrectInput', async () => {
      const mockClient: MockOpenAIClient = {
        moderations: {
          create: vi.fn().mockResolvedValue({
            results: [
              {
                flagged: false,
                categories: {},
              },
            ],
          }),
        },
      }
      const mockCtx: MockValidationCtx = {
        addIssue: vi.fn(),
      }
      const validator = moderationValidator(mockClient as unknown as InstructorClient<OpenAI>)
      const testValue = 'test content'
      await validator(testValue, mockCtx as unknown as z.RefinementCtx)
      expect(mockClient.moderations.create).toHaveBeenCalledWith({
        input: testValue,
      })
    })

    test('shouldProcessModerationResponseCorrectly', async () => {
      const mockClient: MockOpenAIClient = {
        moderations: {
          create: vi.fn().mockResolvedValue({
            results: [
              {
                flagged: true,
                categories: {
                  hate: true,
                  violence: false,
                  harassment: true,
                },
              },
            ],
          }),
        },
      }
      const mockCtx: MockValidationCtx = {
        addIssue: vi.fn(),
      }
      const validator = moderationValidator(mockClient as unknown as InstructorClient<OpenAI>)
      const testValue = 'harmful content'
      await validator(testValue, mockCtx as unknown as z.RefinementCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: `Moderation error, \`${testValue}\` was flagged for hate, harassment`,
      })
    })

    test('shouldHandleErrorsCorrectly', async () => {
      const mockClient: MockOpenAIClient = {
        moderations: {
          create: vi.fn().mockRejectedValue(new Error('API error')),
        },
      }
      const mockCtx: MockValidationCtx = {
        addIssue: vi.fn(),
      }
      const validator = moderationValidator(mockClient as unknown as InstructorClient<OpenAI>)
      await validator('test content', mockCtx as unknown as z.RefinementCtx)
      expect(mockCtx.addIssue).toHaveBeenCalledWith({
        code: 'custom',
        message: 'Unexpected error during moderation: API error',
      })
    })
  })
})
