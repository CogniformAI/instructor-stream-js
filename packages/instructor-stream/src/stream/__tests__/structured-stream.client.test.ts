// oxlint-disable no-explicit-any
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'
import ZodStream from '../structured-stream.client'
import type { StreamingProviderAdapter } from '@/adapters/streaming-provider-adapter'
import type { CompletionMeta } from '@/types'

function createChunkStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}

async function collectChunks<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = []
  for await (const value of generator) {
    results.push(value)
  }
  return results
}

function cloneData<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T
}

describe('structured-stream.client.ts', () => {
  test('shouldStreamSnapshotsWithoutValidation', async () => {
    const schema = z.object({
      name: z.string().optional(),
      age: z.number().optional(),
    })
    const adapter: StreamingProviderAdapter<typeof schema> = {
      async start() {
        return {
          stream: createChunkStream(['{"name":"A', 'lice","age":30}']),
        }
      },
    }
    const zodStream = new ZodStream()
    const generator = await zodStream.create({
      adapter,
      response_model: { schema },
      validationMode: 'none',
    })
    const chunks = await collectChunks(generator)
    expect(chunks.length).toBeGreaterThan(1)
    const finalSnapshot = cloneData(chunks[chunks.length - 1]?.data[0])
    expect(finalSnapshot).toEqual({ name: 'Alice', age: 30 })
    chunks.forEach((chunk) => {
      expect(chunk._meta._isValid).toBe(true)
      expect(chunk._meta._type).toBe('default')
    })
  })

  test('shouldEmitFinalValidationInFinalMode', async () => {
    const schema = z.object({
      message: z.string(),
    })
    const adapter: StreamingProviderAdapter<typeof schema> = {
      async start() {
        return {
          stream: createChunkStream(['{"message":"hel', 'lo"}']),
        }
      },
    }
    const zodStream = new ZodStream()
    const generator = await zodStream.create({
      adapter,
      response_model: { schema },
      validationMode: 'final',
      channelType: 'test-channel',
    })
    const chunks = await collectChunks(generator)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    const finalChunk = chunks[chunks.length - 1]
    expect(finalChunk._meta._type).toBe('test-channel')
    expect(finalChunk._meta._isValid).toBe(true)
    expect(cloneData(finalChunk.data[0])).toEqual({ message: 'hello' })
  })

  test('shouldValidateOnCompletedKeys', async () => {
    const schema = z.object({
      foo: z.string().optional(),
      bar: z.string().optional(),
    })
    const safeParseSpy = vi.spyOn(schema, 'safeParseAsync')
    const adapter: StreamingProviderAdapter<typeof schema> = {
      async start() {
        return {
          stream: createChunkStream(['{"foo":"value"', ',"bar":"done"}']),
        }
      },
    }
    const zodStream = new ZodStream()
    const generator = await zodStream.create({
      adapter,
      response_model: { schema },
      validationMode: 'on-complete',
      channelType: 'on-complete',
    })
    const chunks = await collectChunks(generator)
    expect(chunks.length).toBeGreaterThan(1)
    expect(safeParseSpy).toHaveBeenCalled()
    chunks.forEach((chunk) => {
      expect(chunk._meta._type).toBe('on-complete')
    })
    expect(chunks[chunks.length - 1]?._meta._isValid).toBe(true)
  })

  test('shouldMergeProviderMetadata', async () => {
    const schema = z.object({
      content: z.string(),
    })
    const adapter: StreamingProviderAdapter<typeof schema> = {
      async start() {
        const meta: CompletionMeta = {
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        }
        return {
          stream: createChunkStream(['{"content":"ok"}']),
          meta,
        }
      },
    }
    const zodStream = new ZodStream()
    const generator = await zodStream.create({
      adapter,
      response_model: { schema },
      validationMode: 'final',
    })
    const chunks = await collectChunks(generator)
    const finalChunk = chunks[chunks.length - 1]
    expect(finalChunk._meta.usage?.total_tokens).toBe(15)
  })

  test('shouldSupportLegacyCompletionPromise', async () => {
    const schema = z.object({
      value: z.string(),
    })
    const completionPromise = vi.fn(async () => {
      return createChunkStream(['{"value":"legacy"}'])
    })
    const zodStream = new ZodStream()
    const generator = await zodStream.create({
      completionPromise,
      response_model: { schema },
      validationMode: 'final',
    })
    const chunks = await collectChunks(generator)
    expect(completionPromise).toHaveBeenCalled()
    const finalChunk = chunks[chunks.length - 1]
    expect(cloneData(finalChunk.data[0])).toEqual({ value: 'legacy' })
  })
})
