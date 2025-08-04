import { describe, test, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import createInstructor from '@/instructor'
import type { InstructorClient } from '@/instructor'
import type { CompletionMeta } from '@/types'
import type OpenAI from 'openai'

const TEST_MODEL = 'gpt-4.1-mini'

const UserSchema = z.object({
  age: z.number(),
  name: z.string(),
})

interface MockOpenAIClient {
  baseURL: string
  chat: {
    completions: {
      create: ReturnType<typeof vi.fn>
    }
  }
}

interface MockGenericClient extends MockOpenAIClient {
  apiKey?: string
  customMethod?: () => string
}

interface MockChatCompletion {
  choices: Array<{
    message: {
      content?: string
      tool_calls?: Array<{
        function: {
          name: string
          arguments: string
        }
      }>
    }
  }>
  usage?: {
    total_tokens: number
    prompt_tokens?: number
    completion_tokens?: number
  }
}

interface MockStreamChunk {
  choices: Array<{
    delta: {
      content?: string
      tool_calls?: Array<{
        function: {
          arguments: string
        }
      }>
    }
  }>
}

interface MockAsyncIterable {
  [Symbol.asyncIterator]: () => AsyncGenerator<MockStreamChunk, void, unknown>
}

describe('createInstructor', () => {
  describe('Instructor instantiation', () => {
    test('shouldCreateInstructorWithOpenAIClient', () => {
      const mockOpenAI: MockOpenAIClient = {
        baseURL: 'https://api.openai.com/v1',
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      }
      const client = createInstructor({
        client: mockOpenAI as unknown as OpenAI,
        mode: 'TOOLS',
      })
      expect(client).toBeDefined()
      expect(client.mode).toBe('TOOLS')
      expect(client.provider).toBe('OAI')
    })

    test('shouldCreateInstructorWithGenericClient', () => {
      const mockGenericClient: MockOpenAIClient = {
        baseURL: 'https://api.example.com/v1',
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      }
      const client = createInstructor({
        client: mockGenericClient as unknown as OpenAI,
        mode: 'FUNCTIONS',
      })
      expect(client).toBeDefined()
      expect(client.mode).toBe('FUNCTIONS')
      expect(client.provider).toBe('OTHER')
    })

    test('shouldDetectProviderFromBaseURL', () => {
      const providers = [
        { url: 'https://api.openai.com/v1', expected: 'OAI' },
        { url: 'https://api.together.xyz/v1', expected: 'TOGETHER' },
        { url: 'https://api.endpoints.anyscale.com/v1', expected: 'ANYSCALE' },
        { url: 'https://api.groq.com/openai/v1', expected: 'GROQ' },
        { url: 'https://api.anthropic.com/v1', expected: 'ANTHROPIC' },
        { url: 'https://custom-api.com/v1', expected: 'OTHER' },
      ]
      providers.forEach(({ url, expected }) => {
        const mockClient: MockOpenAIClient = {
          baseURL: url,
          chat: {
            completions: {
              create: vi.fn(),
            },
          },
        }
        const client = createInstructor({
          client: mockClient as unknown as OpenAI,
          mode: 'TOOLS',
        })
        expect(client.provider).toBe(expected)
      })
    })

    test('shouldThrowErrorForInvalidClient', () => {
      const invalidClient = {
        baseURL: 'https://api.openai.com/v1',
      }
      expect(() => {
        createInstructor({
          client: invalidClient as unknown as OpenAI,
          mode: 'TOOLS',
        })
      }).toThrow('Client does not match the required structure')
    })

    test('shouldSetDebugAndRetryOptions', () => {
      const mockClient: MockOpenAIClient = {
        baseURL: 'https://api.openai.com/v1',
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      }
      const client = createInstructor({
        client: mockClient as unknown as OpenAI,
        mode: 'TOOLS',
        debug: true,
        retryAllErrors: true,
      })
      expect(client.debug).toBe(true)
      expect(client.retryAllErrors).toBe(true)
    })
  })

  describe('Standard completion', () => {
    let mockClient: MockOpenAIClient
    let instructor: InstructorClient<OpenAI>

    beforeEach(() => {
      mockClient = {
        baseURL: 'https://api.openai.com/v1',
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      }
      instructor = createInstructor({
        client: mockClient as unknown as OpenAI,
        mode: 'TOOLS',
      })
    })

    test('shouldCallClientWithCorrectParametersStructure', async () => {
      const mockResponse: MockChatCompletion = {
        choices: [
          {
            message: {
              tool_calls: [
                {
                  function: {
                    name: 'User',
                    arguments: JSON.stringify({ name: 'Jason Liu', age: 30 }),
                  },
                },
              ],
            },
          },
        ],
        usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
      }
      mockClient.chat.completions.create.mockResolvedValue(mockResponse)
      try {
        await instructor.chat.completions.create({
          messages: [{ role: 'user', content: 'Jason Liu is 30 years old' }],
          model: TEST_MODEL,
          response_model: { schema: UserSchema, name: 'User' },
          max_retries: 0,
        })
      } catch (error) {
        console.error(error)
      }
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Jason Liu is 30 years old' }],
          model: TEST_MODEL,
          stream: false,
          tools: expect.any(Array),
          tool_choice: expect.any(Object),
        }),
        undefined
      )
    })

    test('shouldHandleErrorsInCompletion', async () => {
      const error = new Error('API Error')
      mockClient.chat.completions.create.mockRejectedValue(error)
      await expect(
        instructor.chat.completions.create({
          messages: [{ role: 'user', content: 'Test' }],
          model: TEST_MODEL,
          response_model: { schema: UserSchema, name: 'User' },
          max_retries: 0,
        })
      ).rejects.toThrow('API Error')
    })
  })

  describe('Streaming completion', () => {
    let mockClient: MockOpenAIClient
    let instructor: InstructorClient<OpenAI>

    beforeEach(() => {
      mockClient = {
        baseURL: 'https://api.openai.com/v1',
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      }
      instructor = createInstructor({
        client: mockClient as unknown as OpenAI,
        mode: 'TOOLS',
      })
    })

    test('shouldReturnAsyncGeneratorForStreamingCompletion', async () => {
      const mockStream: MockAsyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      function: {
                        arguments: '{"name":"J',
                      },
                    },
                  ],
                },
              },
            ],
          }
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      function: {
                        arguments: 'ason","age":30}',
                      },
                    },
                  ],
                },
              },
            ],
          }
        },
      }
      mockClient.chat.completions.create.mockResolvedValue(mockStream)
      const result = await instructor.chat.completions.create({
        messages: [{ role: 'user', content: 'Jason is 30 years old' }],
        model: 'gpt-4.1-mini',
        response_model: { schema: UserSchema, name: 'User' },
        stream: true,
      })
      expect(typeof result[Symbol.asyncIterator]).toBe('function')
    })

    test('shouldYieldChunksWithCorrectDataStructure', async () => {
      const mockStream: MockAsyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      function: {
                        arguments: '{"name":"Jason","age":30}',
                      },
                    },
                  ],
                },
              },
            ],
          }
        },
      }
      mockClient.chat.completions.create.mockResolvedValue(mockStream)
      const stream = await instructor.chat.completions.create({
        messages: [{ role: 'user', content: 'Jason is 30 years old' }],
        model: TEST_MODEL,
        response_model: { schema: UserSchema, name: 'User' },
        stream: true,
      })
      const chunks: { data: Partial<{ age: number; name: string }>[]; _meta: CompletionMeta }[] = []
      for await (const chunk of stream) {
        chunks.push(chunk as never)
        expect(chunk).toHaveProperty('data')
        expect(chunk).toHaveProperty('_meta')
        expect(Array.isArray(chunk.data)).toBe(true)
      }
      expect(chunks.length).toBeGreaterThan(0)
    })

    test('shouldCallClientWithStreamTrue', async () => {
      const mockStream: MockAsyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      function: {
                        arguments: '{"name":"Jason","age":30}',
                      },
                    },
                  ],
                },
              },
            ],
          }
        },
      }
      mockClient.chat.completions.create.mockResolvedValue(mockStream)
      const stream = await instructor.chat.completions.create({
        messages: [{ role: 'user', content: 'Jason is 30 years old' }],
        model: TEST_MODEL,
        response_model: { schema: UserSchema, name: 'User' },
        stream: true,
      })
      const chunks: { data: Partial<{ age: number; name: string }>[]; _meta: CompletionMeta }[] = []
      for await (const chunk of stream) {
        chunks.push(chunk as never)
      }
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
          tools: expect.any(Array),
        }),
        undefined
      )
    })
  })

  describe('Pass-through functionality', () => {
    let mockClient: MockOpenAIClient
    let instructor: InstructorClient<OpenAI>

    beforeEach(() => {
      mockClient = {
        baseURL: 'https://api.openai.com/v1',
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      }
      instructor = createInstructor({
        client: mockClient as unknown as OpenAI,
        mode: 'TOOLS',
      })
    })

    test('shouldPassThroughStandardCompletionWithoutResponseModel', async () => {
      const mockResponse: MockChatCompletion = {
        choices: [
          {
            message: {
              content: 'Hello, world!',
            },
          },
        ],
        usage: { total_tokens: 10 },
      }
      mockClient.chat.completions.create.mockResolvedValue(mockResponse)
      const result = await instructor.chat.completions.create({
        messages: [{ role: 'user', content: 'Say hello' }],
        model: TEST_MODEL,
      })
      expect(result).toEqual(mockResponse)
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        {
          messages: [{ role: 'user', content: 'Say hello' }],
          model: 'gpt-4.1-mini',
        },
        undefined
      )
    })

    test('shouldPassThroughStreamingCompletionWithoutResponseModel', async () => {
      const mockStream: MockAsyncIterable = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: 'Hello' } }] }
          yield { choices: [{ delta: { content: ', world!' } }] }
        },
      }
      mockClient.chat.completions.create.mockResolvedValue(mockStream)
      const result = await instructor.chat.completions.create({
        messages: [{ role: 'user', content: 'Say hello' }],
        model: TEST_MODEL,
        stream: true,
      })
      expect(result).toEqual(mockStream)
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
        {
          messages: [{ role: 'user', content: 'Say hello' }],
          model: 'gpt-4.1-mini',
          stream: true,
        },
        undefined
      )
    })
  })

  describe('Error handling', () => {
    test('shouldThrowErrorWhenCompletionFails', async () => {
      const mockClient: MockOpenAIClient = {
        baseURL: 'https://api.openai.com/v1',
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      }
      const instructor = createInstructor({
        client: mockClient as unknown as OpenAI,
        mode: 'TOOLS',
      })
      await expect(
        instructor.chat.completions.create({
          messages: [{ role: 'user', content: 'Test' }],
          model: TEST_MODEL,
          response_model: { schema: UserSchema, name: 'User' },
        })
      ).rejects.toThrow('API Error')
    })
  })

  describe('Proxy functionality', () => {
    test('shouldProxyClientProperties', () => {
      const mockClient: MockGenericClient = {
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        customMethod: vi.fn(() => 'custom result'),
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      }
      const instructor = createInstructor({
        client: mockClient as unknown as OpenAI,
        mode: 'TOOLS',
      })
      expect(instructor.baseURL).toBe('https://api.openai.com/v1')
      expect(instructor.apiKey).toBe('test-key')
      expect(typeof instructor.chat.completions.create).toBe('function')
    })
  })
})
