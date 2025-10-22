# @cogniformai/instructor-stream

Streaming-first structured data extraction from LLMs with real-time updates.

## Quick Start

```typescript
import { instructor } from '@cogniformai/instructor-stream'
import { z } from 'zod'

const schema = z.object({
  name: z.string(),
  age: z.number(),
})

for await (const result of instructor({
  model: 'gpt-4o-mini',
  response_model: { schema },
  messages: [{ role: 'user', content: 'Extract: John is 25 years old' }],
})) {
  console.log('Streaming data:', result.data)
  console.log('Metadata:', result._meta)
}
```

## Features

- **Real-time Updates**: Get structured data as it streams from LLMs
- **Clean API**: Separate data from metadata with `{ data: T[], _meta }` format
- **Performance Optimized**: Built for production streaming applications
- **Provider Agnostic**: Works with OpenAI, Anthropic, and more

## LangGraph Streaming Adapter

Need to consume LangGraph’s multi-node streams and hydrate different UI surfaces at once? The `langgraph` adapter extracts fragments by `langgraph_node`, feeds them through your Zod schemas, and emits instructor-style snapshots on every chunk.

```typescript
import {
  consumeLanggraphChannels,
  iterableToReadableStream,
} from '@cogniformai/instructor-stream/adapters/langgraph'
import { z } from 'zod'

const Schemas = {
  profile_llm_call: z.object({
    business_name: z.string().nullable().optional(),
    website_url: z.string().nullable().optional(),
  }),
  style_guide_llm_call: z.object({
    tone: z.string().nullable().optional(),
    palette: z.array(z.string()).nullable().optional(),
  }),
} as const

await consumeLanggraphChannels({
  upstream: iterableToReadableStream(langGraphStream), // async iterable of parsed envelopes
  schemas: Schemas,
  onSnapshot: async (node, partial, meta) => {
    console.log(`[${node}]`, partial, meta)
  },
})
```

See `src/adapters/langgraph/README.md` for background, helper utilities, and testing tips.

## Documentation

Visit our [documentation](https://github.com/cogniformai/instructor-stream-js) for complete guides and examples.
