# LangGraph Adapter

Turn LangGraph’s chunked envelopes into streaming, schema-validated snapshots that hydrate your UI as each node completes. This adapter lives entirely on the streaming path—no providers are coupled to the core instructor runtime—so you can slot it into any LangGraph project that emits JSONL/SSE payloads.

## When to Use It

- You tagged multiple LangGraph nodes (`profile`, `style_guide`, `pricing`, …) and need their streams to land in separate components.
- Each tag should hydrate its own Zod schema while unwanted tags are dropped on the floor.
- Your client already uses the instructor stream shape (`{ data, _meta }`) and just needs a bridge from LangGraph.

## Basic Usage

```ts
import { instructorStreamFromLangGraph } from '@cogniformai/instructor-stream/adapters/langgraph'
import { z } from 'zod'

const ProfileSchema = z.object({
  business_name: z.string().nullable().optional(),
  website_url: z.string().nullable().optional(),
})

async function consumeProfile(source: AsyncIterable<unknown>) {
  for await (const snapshot of instructorStreamFromLangGraph({
    source,
    tag: 'profile',
    schema: ProfileSchema,
    typeDefaults: { string: null }, // optional helper so partial fields start as null
  })) {
    console.log('profile update', snapshot)
  }
}
```

`instructorStreamFromLangGraph` expects an async iterable of **already parsed** LangGraph envelopes—the JSON objects you’d get from splitting your JSONL stream and running `JSON.parse`. Each envelope contains the raw `AIMessageChunk` and the system metadata (`tags`, `langgraph_node`, etc.). The adapter:

1. Filters envelopes by `tag` (string match or predicate).
2. Normalises the `content` into a single string (including ordered text parts).
3. Pipes the text through the JSON SchemaStream so you get progressively filled objects that conform to your Zod schema.

## Multi-Tag Routing

When several nodes stream in parallel, use `createTaggedPipelines` to fan out a single LangGraph source into independent schema streams:

```ts
import { createTaggedPipelines } from '@cogniformai/instructor-stream/adapters/langgraph'

const pipelines = createTaggedPipelines(langGraphStream, {
  profile: ProfileSchema,
  style_guide: z.object({
    tone: z.string().nullable().optional(),
    palette: z.array(z.string()).nullable().optional(),
  }),
})

for await (const snapshot of pipelines.profile) {
  profileStore.update(snapshot)
}

for await (const snapshot of pipelines.style_guide) {
  styleGuideStore.update(snapshot)
}
```

Under the hood a single dispatcher reads each LangGraph envelope once, pushes it into per-tag queues, and discards tags you did not register. Nothing buffers indefinitely—queues close as soon as the source is exhausted.

### Gotchas

- Tags are matched exactly. If a node emits multiple tags, the envelope is pushed to every matching pipeline.
- Only `AIMessageChunk` payloads are processed. If a node isn’t streaming chunks, fix it upstream so it does—otherwise nothing will hydrate.
- The helper runs entirely in user space, so you can adapt it to Remix/Next/Express SSE handlers without additional wiring.

## Testing Helpers

See `__tests__/replay-profile.test.ts` for a replay harness that:

- Captures real JSONL from a LangGraph run.
- Replays a window of lines at a realistic tokens-per-second window.
- Verifies the partial snapshots monotonically accumulate data.

You can reuse `replayJsonlLines` for demos or CLI debugging by loading your own JSONL captures.

## Discarding Noise

Not every chunk needs to reach the client. Because the dispatcher filters by tag before enqueuing, it drops unregistered tags immediately. If you have long-lived runs or very chatty nodes, consider capping queue sizes or introducing backpressure—`AsyncQueue` is small enough that you can extend it with `maxLength` semantics.

## See Also

- `index.ts` for the adapter implementation.
- `__tests__/create-tagged-pipelines.test.ts` for multistream fan-out coverage.
- `__tests__/schemas/profile.ts` for a realistic schema with string defaults.
