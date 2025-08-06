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

## Documentation

Visit our [documentation](https://github.com/cogniformai/instructor-stream-js) for complete guides and examples.
