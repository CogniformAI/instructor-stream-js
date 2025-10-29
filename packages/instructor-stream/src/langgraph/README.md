# LangGraph Adapter

Connect LangGraph “messages tuple” envelopes to the Effect-based instructor-stream core. The adapter extracts textual/tool-call fragments, routes them by `langgraph_node`, and feeds them into the schema streaming engine so you receive `{ data, meta }` snapshots as soon as each node updates.

## Quick Start

```ts
import {
  consumeLanggraphChannels,
  iterableToReadableStream,
} from '@cogniformai/instructor-stream/langgraph'
import { z } from 'zod'

const Schemas = {
  ideation_llm_call: z.object({
    ideas: z.array(z.string()).nullable().optional(),
  }),
  screenshot_analysis_llm_call: z.object({
    findings: z.string().nullable().optional(),
  }),
} as const

async function run(streamOfEnvelopes: AsyncIterable<unknown>) {
  await consumeLanggraphChannels({
    upstream: iterableToReadableStream(streamOfEnvelopes),
    schemas: Schemas,
    defaultSchema: z.any(), // optional fallback for unexpected nodes
    validationMode: 'final', // 'none' | 'final' | 'on-complete' (defaults to 'none')
    onSnapshot: async (node, partial, meta) => {
      console.log(`[${node}]`, partial, meta)
    },
  })
}
```

How it works:

1. `langgraphAdapter` scans each envelope, finds `langgraph_node`, and concatenates the `content` fragments (both `text` and `tool_call_chunk.args` are treated identically).
2. `consumeLanggraphChannels` spins up a streaming JSON parser for every node that has a registered schema.
3. Every chunk yields an instructor-style snapshot `{ data: [partial], meta }` where `meta._type` is the node name.
4. Nodes that are not in `schemas` (and have no `defaultSchema`) are discarded immediately—no extra buffering or memory growth.

## Utilities

- `iterableToReadableStream(iterable)` converts the async iterable returned by LangGraph runtimes into a WHATWG `ReadableStream`, which the instructor core expects.
- `langgraphAdapter()` is exposed directly in case you want manual access to `{ node, chunk }` tuples before hydration.

## Schema Naming

Schema keys should match the `langgraph_node` value emitted by LangGraph. This keeps routing explicit:

```ts
const Schemas = {
  ideation_llm_call: IdeationSchema,
  screenshot_analysis_llm_call: AnalysisSchema,
}
```

If you provide a `defaultSchema`, any node without an explicit entry will use it instead of being dropped.

## Snapshot Shape

`onSnapshot` receives:

- `node`: the emitting `langgraph_node`.
- `snapshot`: the partial object (first element of the instructor `data` array).
- `meta`: the usual instructor metadata with `_type` set to the node name and `_activePath`/`_completedPaths` tracking progress.

The partial accumulates fields as soon as the JSON fragment becomes valid; no artificial throttling is applied.

## Handling Tool Calls

LangGraph tool-call chunks arrive as `content[*].type === 'tool_call_chunk'` with `args` already stringified JSON. The adapter treats them like any other fragment: `args` is appended to the node’s JSON stream and validated against the node’s schema. If tool calls need a different schema, split them into their own node and register the appropriate schema.

## Ignoring Noise

- Envelopes missing `langgraph_node` or providing empty fragments are skipped.
- Nodes with no schema entry (and no default) are ignored, keeping queues tight.

## See Also

- `consumeLanggraphChannels` implementation (`packages/instructor-stream/src/langgraph/channels.ts`)
- `langgraphAdapter` (`packages/instructor-stream/src/langgraph/adapter.ts`)
- Tests covering the flow (`packages/instructor-stream/src/langgraph/__tests__/adapter.test.ts`)
