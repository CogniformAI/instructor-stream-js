import {
  consumeLanggraphChannels,
  iterableToReadableStream,
} from '@cogniformai/instructor-stream/langgraph'
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

const Schemas = {
  ideation_llm_call: z.object({
    ideas: z.array(z.string()).nullable().optional(),
  }),
  screenshot_analysis_llm_call: z.object({
    findings: z.string().nullable().optional(),
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
  await consumeLanggraphChannels({
    upstream: iterableToReadableStream(mockLangGraphSource()),
    schemas: Schemas,
    validationMode: 'final',
    onSnapshot: async (node, snapshot, meta) => {
      console.log(`[${node}]`, snapshot, meta)
    },
  })
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((error) => {
  console.error(error)
  process.exit(1)
})
