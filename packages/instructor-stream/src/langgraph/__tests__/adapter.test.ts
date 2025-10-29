import { describe, expect, test, vi } from 'vitest'
import { langgraphAdapter } from '../adapter.ts'
import { consumeLanggraphChannels } from '../channels.ts'
import { z } from 'zod'
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

describe('langgraphAdapter', () => {
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

    const reader = envelopes.pipeThrough(langgraphAdapter()).getReader()
    const { value, done } = await reader.read()
    expect(done).toBe(false)
    expect(value).toEqual({
      node: 'alpha',
      chunk: '{"message": "hello" }',
    })
    const next = await reader.read()
    expect(next.done).toBe(true)
  })

  test('ignores envelopes without node or usable content', async () => {
    const envelopes = streamFromArray([
      { data: [{ content: [{ type: 'text', text: '' }] }] },
      { data: [{ langgraph_node: '' }] },
    ])
    const reader = envelopes.pipeThrough(langgraphAdapter()).getReader()
    const result = await reader.read()
    expect(result.done).toBe(true)
  })
})

describe('consumeLanggraphChannels', () => {
  test('routes per-node streams and yields instructor-style snapshots', async () => {
    const envelopes = streamFromArray([
      {
        data: [
          {
            content: [{ type: 'text', text: '{"message": ' }],
          },
          { langgraph_node: 'alpha' },
        ],
      },
      {
        data: [
          {
            content: [{ type: 'tool_call_chunk', args: '"hello"}' }],
          },
          { langgraph_node: 'alpha' },
        ],
      },
      {
        data: [
          {
            content: [{ type: 'text', text: '{"value":' }],
          },
          { langgraph_node: 'beta' },
        ],
      },
      {
        data: [
          {
            content: [{ type: 'tool_call_chunk', args: '42}' }],
          },
          { langgraph_node: 'beta' },
        ],
      },
      {
        data: [
          {
            content: [{ type: 'text', text: '{"ignored": true}' }],
          },
          { langgraph_node: 'gamma' },
        ],
      },
    ])

    const snapshots: Record<string, Array<{ data: unknown; meta: CompletionMeta }>> = {}
    const onSnapshot = vi.fn(async (node: string, data: unknown, meta: CompletionMeta) => {
      snapshots[node] ??= []
      snapshots[node]?.push({ data, meta })
    })

    const schemaAlpha = z.object({
      message: z.string().nullable().optional(),
    })
    const schemaBeta = z.object({
      value: z.number().nullable().optional(),
    })

    await consumeLanggraphChannels({
      upstream: envelopes,
      schemas: {
        alpha: schemaAlpha,
        beta: schemaBeta,
      },
      onSnapshot,
      validationMode: 'final',
    })

    expect(onSnapshot).toHaveBeenCalled()
    expect(Object.keys(snapshots)).toEqual(['alpha', 'beta'])
    const alphaSnaps = snapshots.alpha ?? []
    const alphaFinal = alphaSnaps[alphaSnaps.length - 1]
    expect(alphaFinal?.data).toEqual({ message: 'hello' })
    expect(alphaFinal?.meta).toMatchObject({ _type: 'alpha' })

    const betaSnaps = snapshots.beta ?? []
    const betaFinal = betaSnaps[betaSnaps.length - 1]
    expect(betaFinal?.data).toEqual({ value: 42 })
    expect(betaFinal?.meta).toMatchObject({ _type: 'beta' })
  })

  test('swallows snapshot errors when failFast is unset', async () => {
    const envelopes = streamFromArray([
      {
        data: [
          {
            content: [{ type: 'text', text: '{"message": ' }],
          },
          { langgraph_node: 'alpha' },
        ],
      },
      {
        data: [
          {
            content: [{ type: 'tool_call_chunk', args: '"hello"}' }],
          },
          { langgraph_node: 'alpha' },
        ],
      },
    ])

    const onSnapshot = vi.fn(async () => {
      throw new Error('snapshot failure')
    })

    await expect(
      consumeLanggraphChannels({
        upstream: envelopes,
        schemas: {
          alpha: z.object({
            message: z.string(),
          }),
        },
        onSnapshot,
        validationMode: 'final',
      })
    ).resolves.toBeUndefined()

    expect(onSnapshot).toHaveBeenCalledTimes(1)
  })

  test('throws snapshot errors when failFast is true', async () => {
    const envelopes = streamFromArray([
      {
        data: [
          {
            content: [{ type: 'text', text: '{"message": ' }],
          },
          { langgraph_node: 'alpha' },
        ],
      },
      {
        data: [
          {
            content: [{ type: 'tool_call_chunk', args: '"hello"}' }],
          },
          { langgraph_node: 'alpha' },
        ],
      },
    ])

    const onSnapshot = vi.fn(async () => {
      throw new Error('snapshot failure')
    })

    await expect(
      consumeLanggraphChannels({
        upstream: envelopes,
        schemas: {
          alpha: z.object({
            message: z.string(),
          }),
        },
        onSnapshot,
        validationMode: 'final',
        failFast: true,
      })
    ).rejects.toThrowError('snapshot failure')

    expect(onSnapshot).toHaveBeenCalledTimes(1)
  })
})
