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

Need to consume LangGraph’s multi-node streams and hydrate different UI surfaces at once? The `langgraph` adapter filters each envelope by tag, feeds it through your Zod schema, and yields partial snapshots as they arrive.

```typescript
import { createTaggedPipelines } from '@cogniformai/instructor-stream/adapters/langgraph'
import { z } from 'zod'

const ProfileSchema = z.object({
  business_name: z.string().nullable().optional(),
  website_url: z.string().nullable().optional(),
})

const StyleGuideSchema = z.object({
  tone: z.string().nullable().optional(),
  palette: z.array(z.string()).nullable().optional(),
})

// langGraphStream is an AsyncIterable of parsed JSONL envelopes from LangGraph
const pipelines = createTaggedPipelines(langGraphStream, {
  profile: ProfileSchema,
  style_guide: StyleGuideSchema,
})

for await (const snapshot of pipelines.profile) {
  // hydrate profile UI as fields fill in
  console.log('profile update', snapshot)
}

for await (const snapshot of pipelines.style_guide) {
  console.log('style guide update', snapshot)
}
```

See `src/adapters/langgraph/README.md` for background, helper utilities, and testing tips.

## Documentation

Visit our [documentation](https://github.com/cogniformai/instructor-stream-js) for complete guides and examples.
