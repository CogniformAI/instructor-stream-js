import { iterableToReadableStream, streamLangGraph } from '@cogniformai/instructor-stream/langgraph'
import { Stream, Effect } from 'effect'
import { z } from 'zod'

type Envelope = {
  event: 'messages'
  data: [
    {
      content: Array<{
        type: 'text' | 'tool_call_chunk'
        text?: string
        args?: string
        index?: number
      }>
    },
    {
      langgraph_node: string
    },
  ]
}

const RootSchema = {
  name: 'mock-graph',
  zod: z.object({
    ideation_llm_call: z.object({
      ideas: z.array(z.string()).nullable().optional(),
    }),
    screenshot_analysis_llm_call: z.object({
      findings: z.string().nullable().optional(),
    }),
  }),
} as const

async function* mockLangGraphSource(): AsyncIterable<Envelope> {
  yield {
    event: 'messages',
    data: [
      {
        content: [{ type: 'text', text: '{"ideas":["launch ' }],
      },
      { langgraph_node: 'ideation_llm_call' },
    ],
  }
  yield {
    event: 'messages',
    data: [
      {
        content: [{ type: 'text', text: 'feature"]}' }],
      },
      { langgraph_node: 'ideation_llm_call' },
    ],
  }
  yield {
    event: 'messages',
    data: [
      {
        content: [{ type: 'text', text: '{"findings":"hero section needs contrast"}' }],
      },
      { langgraph_node: 'screenshot_analysis_llm_call' },
    ],
  }
}

async function main() {
  const stream = streamLangGraph({
    upstream: iterableToReadableStream(mockLangGraphSource()),
    schema: RootSchema,
    validation: 'final',
    onSnapshot: async (snapshot, meta) => {
      console.log(`[${meta._type}]`, snapshot, meta)
    },
  })

  await Effect.runPromise(Stream.runDrain(stream))
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((error) => {
  console.error(error)
  process.exit(1)
})
