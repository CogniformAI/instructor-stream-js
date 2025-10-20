import { describe, expect, it } from 'vitest'
import { streamLangGraphEvents, type LangGraphStreamEvent } from '../index.ts'
import { z } from 'zod'

const messageSchema = z.object({ foo: z.string() })
const toolSchemas = {
  fetch_profile: z.object({ business: z.string() }),
} as const

function createEnvelope(raw: unknown) {
  return raw
}

async function collectEvents(
  source: AsyncIterable<unknown>
): Promise<LangGraphStreamEvent<typeof messageSchema, typeof toolSchemas>[]> {
  const events: LangGraphStreamEvent<typeof messageSchema, typeof toolSchemas>[] = []
  for await (const evt of streamLangGraphEvents({
    source,
    tag: 'profile',
    schema: messageSchema,
    toolSchemas,
    typeDefaults: { string: null },
  })) {
    events.push(evt)
  }
  return events
}

describe('streamLangGraphEvents', () => {
  it('emits message snapshots with matchedTag when tag selector is a string', async () => {
    async function* source(): AsyncGenerator<unknown> {
      yield createEnvelope({
        event: 'messages',
        data: [
          {
            type: 'ai',
            content: [
              { type: 'text', text: '{"foo":', index: 'lc_txt_0' },
              { type: 'text', text: '"hi"}', index: 'lc_txt_10' },
            ],
          },
          {
            tags: ['initial', 'profile'],
            langgraph_node: 'profile_llm',
          },
        ],
      })
    }

    const events = await collectEvents(source())

    const messages = events.filter((event) => event.kind === 'message')
    expect(messages.length).toBeGreaterThan(0)
    const latest = messages[messages.length - 1]

    expect(latest.kind).toBe('message')
    if (latest.kind === 'message') {
      expect(latest.identifier).toBe('profile')
      expect(latest.matchedTag).toBe('profile')
      expect(latest.data).toEqual({ foo: 'hi' })
    }
  })

  it('streams tool-call args from universal tool_call blocks', async () => {
    async function* source(): AsyncGenerator<unknown> {
      yield createEnvelope({
        event: 'messages',
        data: [
          {
            type: 'ai',
            content: [
              {
                type: 'tool_call',
                name: 'fetch_profile',
                id: 'call-1',
                args: {
                  business: 'Acme',
                },
              },
            ],
          },
          {
            tags: ['profile'],
          },
        ],
      })
    }

    const events = await collectEvents(source())

    const tools = events.filter((event) => event.kind === 'tool')
    expect(tools.length).toBeGreaterThan(0)
    const toolEvent = tools[tools.length - 1]

    expect(toolEvent.kind).toBe('tool')
    if (toolEvent.kind === 'tool') {
      expect(toolEvent.toolName).toBe('fetch_profile')
      expect(toolEvent.toolCallId).toBe('call-1')
      expect(toolEvent.identifier).toBe('fetch_profile')
      expect(toolEvent.matchedTag).toBe('profile')
      expect(toolEvent.data).toEqual({ business: 'Acme' })
      expect(toolEvent.rawArgs).toBe('{"business":"Acme"}')
    }
  })

  it('normalizes primitive string tool_call args into valid JSON', async () => {
    async function* source(): AsyncGenerator<unknown> {
      yield createEnvelope({
        event: 'messages',
        data: [
          {
            type: 'ai',
            content: [
              {
                type: 'tool_call',
                name: 'fetch_profile',
                id: 'call-primitive',
                args: 'tense',
              },
            ],
          },
          {
            tags: ['profile'],
          },
        ],
      })
    }

    const events: LangGraphStreamEvent<typeof messageSchema, { fetch_profile: z.ZodAny }>[] = []
    for await (const evt of streamLangGraphEvents({
      source: source(),
      tag: 'profile',
      schema: messageSchema,
      toolSchemas: { fetch_profile: z.any() },
      typeDefaults: { string: null },
    })) {
      events.push(evt)
    }

    const toolEvent = events.find((event) => event.kind === 'tool')
    expect(toolEvent).toBeDefined()
    if (toolEvent?.kind === 'tool') {
      expect(toolEvent.toolName).toBe('fetch_profile')
      expect(toolEvent.toolCallId).toBe('call-primitive')
      expect(toolEvent.identifier).toBe('fetch_profile')
      expect(toolEvent.matchedTag).toBe('profile')
      expect(toolEvent.rawArgs).toBe('"tense"')
      if (typeof toolEvent.data === 'string') {
        expect(toolEvent.data).toBe('tense')
      } else if (toolEvent.data && typeof toolEvent.data === 'object') {
        expect(Object.values(toolEvent.data)).toContain('tense')
      } else {
        throw new Error('Unexpected tool data shape')
      }
    }
  })

  it('coalesces tool-call chunks without id or name using the message id fallback', async () => {
    const sharedMeta = {
      tags: ['profile'],
      langgraph_node: 'profile_llm',
    }

    async function* source(): AsyncGenerator<unknown> {
      yield createEnvelope({
        event: 'messages',
        data: [
          {
            type: 'AIMessageChunk',
            id: 'msg-1',
            content: [
              {
                type: 'tool_call_chunk',
                name: 'fetch_profile',
                id: 'call-xyz',
                args: '',
                index: 0,
              },
            ],
            tool_calls: [
              {
                name: 'fetch_profile',
                args: {},
                id: 'call-xyz',
                type: 'tool_call',
              },
            ],
          },
          sharedMeta,
        ],
      })

      const chunks = ['{"', 'business', '":"', 'Acme', '"}']
      for (const piece of chunks) {
        yield createEnvelope({
          event: 'messages',
          data: [
            {
              type: 'AIMessageChunk',
              id: 'msg-1',
              content: [
                {
                  type: 'tool_call_chunk',
                  name: null,
                  id: null,
                  args: piece,
                  index: 0,
                },
              ],
              tool_calls: [
                {
                  name: null,
                  args: {},
                  id: null,
                  type: 'tool_call',
                },
              ],
            },
            sharedMeta,
          ],
        })
      }
    }

    const events = await collectEvents(source())
    const tools = events.filter((event) => event.kind === 'tool')
    expect(tools.length).toBeGreaterThan(0)
    const toolEvent = tools[tools.length - 1]
    expect(toolEvent.kind).toBe('tool')
    if (toolEvent.kind === 'tool') {
      expect(toolEvent.toolName).toBe('fetch_profile')
      expect(toolEvent.toolCallId).toBe('call-xyz')
      expect(toolEvent.rawArgs).toBe('{"business":"Acme"}')
      expect(toolEvent.data).toEqual({ business: 'Acme' })
    }
  })
})
