# LangGraph Adapter

Connect LangGraph “messages tuple” envelopes to the Effect-based instructor-stream core. The new adapter peels `{ langgraph_node, text-delta }` tuples, multiplexes them through a single `SchemaStream`, and emits `{ data, _meta }` snapshots as soon as any node completes a JSON value—no per-node pipelines required.

## Quick Start

```ts
import { iterableToReadableStream, streamLangGraph } from '@cogniformai/instructor-stream/langgraph'
import { Effect, Stream } from 'effect'
import { z } from 'zod'

const RootSchema = {
  name: 'design-graph',
  zod: z.object({
    ideation_llm_call: z.object({
      ideas: z.array(z.string()).nullable().optional(),
    }),
    screenshot_analysis_llm_call: z.object({
      findings: z.string().nullable().optional(),
    }),
  }),
} as const

async function run(streamOfEnvelopes: AsyncIterable<unknown>) {
  const stream = streamLangGraph({
    upstream: iterableToReadableStream(streamOfEnvelopes),
    schema: RootSchema,
    validation: 'final', // 'none' | 'final' (defaults to 'none')
    // defaultNode: 'fallback', // optionally direct tuples missing `langgraph_node`
  onSnapshot: async (snapshot, meta) => {
    console.log(`[${meta._type}]`, snapshot, meta)
  },
  })

  await Effect.runPromise(Stream.runDrain(stream))
}
```

## How It Works

1. `fastAdapter()` walks the SSE envelope once, yielding `{ node, text }` deltas as soon as they appear. Empty fragments are skipped and tuple order is preserved (LangGraph already guarantees FIFO per node).
2. `streamLangGraph()` routes every delta through a single `SchemaStream`. Each node’s JSON parser keeps its own state while sharing the same root snapshot object.
3. Whenever a JSON value finishes (`TokenParserState === VALUE` and not partial), the current snapshot is emitted with `meta._type` set to the emitting node. Partial values never leak.
4. At stream completion, optional `'final'` validation re-parses the aggregated object with your root Zod schema.

## Utilities

- `iterableToReadableStream(iterable)` converts the async iterable returned by LangGraph runtimes into a WHATWG `ReadableStream` for browser / worker compatibility.
- `fastAdapter(options?)` is exported directly if you need raw `{ node, text }` access (e.g., custom buffering or logging) before hydrating through `streamLangGraph`.

## Schema Layout

- Supply a **single root schema** whose keys match `langgraph_node` identifiers. Each node’s sub-schema can be as strict or loose as you need.
- Missing nodes simply retain their default values. To opt-out entirely, omit the key from the root schema; the parser still tracks deltas but nothing is written to the snapshot.

```ts
const RootSchema = {
  name: 'graph',
  zod: z.object({
    agent: AgentSchema,
    tools: ToolSchema,
  }),
}
```

## Snapshot Shape

Every emission is the full root object as it exists at that moment:

- `chunk.data[0]` — the aggregated snapshot keyed by node
- `chunk._meta` — instructor metadata (`_type` = node, `_activePath`, `_completedPaths`, `_isValid`)

Because snapshots are immutable references to the shared object, downstream consumers should clone if they plan to mutate.

## Tool Calls & Text Blocks

`fastAdapter` treats `content[*].type === 'text'` and `tool_call_chunk` identically. Tool-call `args` strings are appended directly to the node’s JSON stream, so you can keep tool call schemas alongside regular completion data (or split into separate nodes if you prefer).

## Noise Handling

- Envelopes missing `langgraph_node` or emitting empty fragments are dropped immediately.
- Unknown nodes are ignored unless you include them in the root schema.
- Back-pressure is governed entirely by Effect streams—no extra `ReadableStream` fan-out or buffering is introduced.

## Missing Node Defaults

- Pass `defaultNode` to `streamLangGraph` (or `fastAdapter`) to route tuples that never declare `langgraph_node`.
- Provide `onMissingNode` if you want to log or meter dropped tuples yourself; otherwise a one-time warning is emitted.

```ts
const stream = streamLangGraph({
  upstream,
  schema: RootSchema,
  defaultNode: 'fallback',
  onMissingNode: (chunk) => logger.warn('missing node', chunk),
})
```

## Parser Tuning

- Adjust `stringEmitInterval` via `SchemaStream.parse({ stringEmitInterval })` or `schemaStream.ingest` options to trade callback frequency for throughput; the default is `256` bytes.
- Larger intervals reduce `partial` string events; smaller intervals improve latency for character-by-character UIs.

## See Also

- `fastAdapter` implementation (`packages/instructor-stream/src/langgraph/fast-adapter.ts`)
- `streamLangGraph` pipeline (`packages/instructor-stream/src/langgraph/stream.ts`)
- Tests covering interleaving nodes (`packages/instructor-stream/src/langgraph/__tests__/adapter.test.ts`)
