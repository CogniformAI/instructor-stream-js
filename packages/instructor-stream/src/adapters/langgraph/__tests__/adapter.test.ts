import { describe, expect, test, vi } from 'vitest'
import { fastAdapter } from '../fast-adapter.ts'
import { streamLangGraph } from '../stream.ts'
import { z } from 'zod'
import { Stream, Effect } from 'effect'
import type { CompletionMeta } from '@/effect'

const streamFromArray = <T>(items: T[]): ReadableStream<T> =>
  new ReadableStream<T>({
    start(controller) {
      for (const item of items) {
        controller.enqueue(item)
      }
      controller.close()
    },
  })

describe('fastAdapter', () => {
  test('extracts node chunks combining text and tool fragments', async () => {
    const envelopes = streamFromArray([
      {
        data: [
          {
            content: [
              { type: 'text', text: '{"message": ', index: 0 },
              { type: 'tool_call_chunk', args: '"hello"', index: 1 },
              { type: 'text', text: ' }', index: 2 },
            ],
          },
          { langgraph_node: 'alpha' },
        ],
      },
    ])

    const reader = envelopes.pipeThrough(fastAdapter()).getReader()
    const first = await reader.read()
    expect(first.value).toEqual({ node: 'alpha', text: '{"message": ' })
    const second = await reader.read()
    expect(second.value).toEqual({ node: 'alpha', text: '"hello"' })
    const third = await reader.read()
    expect(third.value).toEqual({ node: 'alpha', text: ' }' })
    const final = await reader.read()
    expect(final.done).toBe(true)
  })

  test('ignores envelopes without node or usable content', async () => {
    const envelopes = streamFromArray([
      { data: [{ content: [{ type: 'text', text: '' }] }] },
      { data: [{ langgraph_node: '' }] },
    ])
    const reader = envelopes.pipeThrough(fastAdapter({ onMissingNode: () => {} })).getReader()
    const result = await reader.read()
    expect(result.done).toBe(true)
  })

  test('uses defaultNode option when langgraph_node is missing', async () => {
    const envelopes = streamFromArray([
      {
        data: [{ content: [{ type: 'text', text: 'hello' }] }],
      },
    ])

    const reader = envelopes.pipeThrough(fastAdapter({ defaultNode: 'fallback' })).getReader()
    const { value, done } = await reader.read()
    expect(done).toBe(false)
    expect(value).toEqual({ node: 'fallback', text: 'hello' })
    const final = await reader.read()
    expect(final.done).toBe(true)
  })

  test('calls onMissingNode once when tuples lack node information', async () => {
    const onMissingNode = vi.fn()
    const envelopes = streamFromArray([
      {
        data: [{ content: [{ type: 'text', text: 'hello' }] }],
      },
    ])

    const reader = envelopes.pipeThrough(fastAdapter({ onMissingNode })).getReader()
    const result = await reader.read()
    expect(result.done).toBe(true)
    expect(onMissingNode).toHaveBeenCalledTimes(1)
  })
})

describe('streamLangGraph', () => {
  test('yields root-keyed snapshots across interleaved nodes', async () => {
    const envelopes = streamFromArray([
      {
        data: [{ content: [{ type: 'text', text: '{"message": ' }] }, { langgraph_node: 'alpha' }],
      },
      {
        data: [{ content: [{ type: 'text', text: '{"value":' }] }, { langgraph_node: 'beta' }],
      },
      {
        data: [
          { content: [{ type: 'tool_call_chunk', args: '"hello"}' }] },
          { langgraph_node: 'alpha' },
        ],
      },
      {
        data: [{ content: [{ type: 'tool_call_chunk', args: '42}' }] }, { langgraph_node: 'beta' }],
      },
    ])

    const rootSchema = {
      name: 'graph',
      zod: z.object({
        alpha: z.object({
          message: z.string().nullable().optional(),
        }),
        beta: z.object({
          value: z.number().nullable().optional(),
        }),
      }),
    }

    const stream = streamLangGraph({
      upstream: envelopes,
      schema: rootSchema,
      validation: 'none',
    })

    const collected = await Effect.runPromise(Stream.runCollect(stream))
    const snapshots = [...collected]

    expect(snapshots).toHaveLength(2)

    const [first, second] = snapshots
    expect(first.meta).toMatchObject({ _type: 'alpha', _isValid: true })
    expect(first.data[0]).toMatchObject({
      alpha: { message: 'hello' },
    })

    expect(second.meta).toMatchObject({ _type: 'beta', _isValid: true })
    expect(second.data[0]).toMatchObject({
      alpha: { message: 'hello' },
      beta: { value: 42 },
    })
  })

  test('runs onSnapshot callback for each emission', async () => {
    const envelopes = streamFromArray([
      {
        data: [
          { content: [{ type: 'text', text: '{"message": "hi"}' }] },
          { langgraph_node: 'alpha' },
        ],
      },
    ])

    const onSnapshot = vi.fn(
      async (_snapshot: Partial<{ alpha: { message: string } }>, _meta: CompletionMeta) => undefined
    )

    const stream = streamLangGraph({
      upstream: envelopes,
      schema: {
        name: 'graph',
        zod: z.object({
          alpha: z.object({
            message: z.string().nullable().optional(),
          }),
        }),
      },
      validation: 'none',
      onSnapshot,
    })

    await Effect.runPromise(Stream.runDrain(stream))

    expect(onSnapshot).toHaveBeenCalledTimes(1)
    const [snapshotArg, metaArg] = onSnapshot.mock.calls[0] ?? []
    expect(snapshotArg).toEqual({
      alpha: {
        message: 'hi',
      },
    })
    expect(metaArg).toMatchObject({ _type: 'alpha', _isValid: true })
  })

  test('uses defaultNode when upstream omits langgraph_node', async () => {
    const envelopes = streamFromArray([
      {
        data: [{ content: [{ type: 'text', text: '{"message": "hi"}' }] }],
      },
    ])

    const stream = streamLangGraph({
      upstream: envelopes,
      schema: {
        name: 'graph',
        zod: z.object({
          fallback: z.object({
            message: z.string().nullable().optional(),
          }),
        }),
      },
      defaultNode: 'fallback',
    })

    const collected = await Effect.runPromise(Stream.runCollect(stream))
    expect(collected.length).toBe(1)
    const [chunk] = collected
    expect(chunk.meta._type).toBe('fallback')
    expect(chunk.data[0]).toEqual({ fallback: { message: 'hi' } })
  })
})
