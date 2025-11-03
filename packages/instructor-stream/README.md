# @cogniformai/instructor-stream

Streaming-first structured data extraction from LLMs with real-time updates.

## Quick Start

```ts
import { Effect, Layer, Stream, Redacted } from 'effect'
import * as Schema from 'effect/Schema'
import { z } from 'zod'
import { Prompt } from '@effect/ai/Prompt'
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient'
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai'

import { instructorStream, SnapshotHydratorLayer } from '@cogniformai/instructor-stream'

const Person = Schema.Struct({
  name: Schema.String,
  age: Schema.Number,
})

const PersonZod = z.object({
  name: z.string(),
  age: z.number(),
})

const program = Stream.runCollect(
  instructorStream({
    schema: { name: 'Person', effect: Person, zod: PersonZod },
    prompt: Prompt.text('Extract the name and age from: John is 25 years old.'),
    validationMode: 'final',
  })
).pipe(
  Effect.provide(
    Layer.mergeAll(
      SnapshotHydratorLayer,
      NodeHttpClient.layer,
      OpenAiClient.layer({ apiKey: Redacted.make(process.env.OPENAI_API_KEY!) }),
      OpenAiLanguageModel.layer({ model: 'gpt-4o-mini' })
    )
  )
)

const snapshots = await Effect.runPromise(program)
for (const chunk of snapshots) {
  console.log('data', chunk.data[0])
  console.log('meta', chunk.meta)
}
```

## Features

- **Real-time Updates**: Get structured data as it streams from LLMs
- **Clean API**: Separate data from metadata with `{ data: T[], meta }` format
- **Performance Optimized**: Built for production streaming applications
- **Provider Agnostic**: Works with OpenAI, Anthropic, and more

## LangGraph Streaming Adapter

Need to consume LangGraph’s multi-node streams and hydrate different UI surfaces at once? The `langgraph` adapter extracts fragments by `langgraph_node`, feeds them through a single root schema, and emits instructor-style snapshots on every chunk.

```typescript
import { iterableToReadableStream, streamLangGraph } from '@cogniformai/instructor-stream/langgraph'
import { Effect, Stream } from 'effect'
import { z } from 'zod'

const RootSchema = {
  name: 'profile-stream',
  zod: z.object({
    profile_llm_call: z.object({
      business_name: z.string().nullable().optional(),
      website_url: z.string().nullable().optional(),
    }),
    style_guide_llm_call: z.object({
      tone: z.string().nullable().optional(),
      palette: z.array(z.string()).nullable().optional(),
    }),
  }),
} as const

const stream = streamLangGraph({
  upstream: iterableToReadableStream(langGraphStream), // async iterable of parsed envelopes
  schema: RootSchema,
  validation: 'final',
  // defaultNode: 'fallback', // optionally route tuples missing `langgraph_node`
  onSnapshot: async (snapshot, meta) => {
    console.log(`[${meta._type}]`, snapshot, meta)
  },
})

await Effect.runPromise(Stream.runDrain(stream))
```

See `src/langgraph/README.md` for background, helper utilities, and testing tips, including:

- `defaultNode` / `onMissingNode` for tuples that omit `langgraph_node`
- Parser tuning knobs such as `stringEmitInterval` for fine-grained latency vs throughput control

## Documentation

Visit our [documentation](https://github.com/cogniformai/instructor-stream-js) for complete guides and examples.
