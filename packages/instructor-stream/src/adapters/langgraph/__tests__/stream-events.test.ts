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
            type: 'AIMessageChunk',
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

  it('streams tool-call args grouped by tool name and preserves matched tag', async () => {
    async function* source(): AsyncGenerator<unknown> {
      // First chunk introduces the tool call and the opening of the JSON payload
      yield createEnvelope({
        event: 'messages',
        data: [
          {
            type: 'AIMessageChunk',
            content: [
              {
                type: 'tool_call_chunk',
                name: 'fetch_profile',
                id: 'call-1',
                args: '{"business":',
              },
            ],
          },
          {
            tags: ['profile'],
          },
        ],
      })

      // Second chunk completes the payload and should flush an event
      yield createEnvelope({
        event: 'messages',
        data: [
          {
            type: 'AIMessageChunk',
            content: [
              {
                type: 'tool_call_chunk',
                name: 'fetch_profile',
                id: 'call-1',
                args: '"Acme"}',
              },
            ],
          },
          {
            tags: ['profile', 'tooling'],
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
})
