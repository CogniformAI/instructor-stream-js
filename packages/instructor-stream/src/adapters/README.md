# Adapter Interfaces

Provider integrations should implement the `StreamingProviderAdapter` contract so the instructor-stream core can consume schema-driven JSON streams without provider-specific conditionals.

At minimum an adapter must:

- Accept the Zod schema describing the expected payload.
- Optionally accept a provider payload (`data`) and `AbortSignal`.
- Return a `ReadableStream<Uint8Array>` that emits UTF-8 JSON fragments.
- Optionally surface provider metadata (token usage, billing metrics) in the `meta` field on the returned object.

Quick start example using a legacy completion function:

    import { createFunctionStreamingAdapter } from '@/adapters'

    const openAIAdapter = createFunctionStreamingAdapter(async ({ data, signal }) => {
      return await openAIClient.chat.completions.create({
        ...data,
        stream: true,
        signal,
      })
    })

Pass the adapter to `ZodStream.create`. The core engine handles token parsing, schema stubbing, progressive snapshots, and validation.
