# Documentation

This directory will contain documentation for instructor-stream-js once we reach a stable API.

## Getting Started (Effect Runtime)

```bash
pnpm install
pnpm --filter @cogniformai/instructor-stream build
```

Minimal streaming program:

```ts
import { Effect, Layer, Stream, Redacted } from 'effect'
import * as Schema from 'effect/Schema'
import { z } from 'zod'
import { Prompt } from '@effect/ai/Prompt'
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient'
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai'
import { instructorStream, SnapshotHydratorLayer } from '@cogniformai/instructor-stream'

const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
const PersonZod = z.object({ name: z.string(), age: z.number() })

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

await Effect.runPromise(program)
```

LangGraph adapter:

```ts
import { iterableToReadableStream, streamLangGraph } from '@cogniformai/instructor-stream/langgraph'
import { Effect, Stream } from 'effect'
import { z } from 'zod'

const stream = streamLangGraph({
  upstream: iterableToReadableStream(streamOfEnvelopes),
  schema: {
    name: 'alpha-only',
    zod: z.object({
      alpha: z.object({ title: z.string().nullable().optional() }),
    }),
  },
  validation: 'final',
  // defaultNode: 'alpha',
  onSnapshot: async (snapshot, meta) => {
    console.log(meta._type, snapshot, meta)
  },
})

await Effect.runPromise(Stream.runDrain(stream))
```

See `packages/examples/langgraph-channels` for a runnable fixture that prints per-node snapshots using mocked LangGraph envelopes. Consult `src/langgraph/README.md` for defaults (`defaultNode`, `onMissingNode`) and parser tuning options such as `stringEmitInterval`.

## Development Resources

- [PLAN.md](roadmap/PLAN.md) - Complete development roadmap
- [CLEANUP.md](roadmap/CLEANUP.md) - Repository cleanup documentation
- [CHANGELOG.md](../CHANGELOG.md) - Version history and changes

For the original instructor-js documentation, see:

- https://github.com/instructor-ai/instructor-js
- https://instructor-ai.github.io/instructor-js/

## Contributing to Documentation

Documentation contributions will be welcome once the API stabilizes. We plan to use:

- **MkDocs** for static site generation
- **TypeScript** for API documentation generation
- **Interactive examples** for better learning experience

Stay tuned for updates as we progress through the development phases!
