import { type CompletionMeta } from '@/types'
import { z } from 'zod'

/**
 * Generic request payload provided to streaming adapters.
 *
 * `schema` is the Zod structure describing the expected streamed object.
 * `data` carries provider-specific payloads used to initiate the request.
 * `signal` allows callers to abort the upstream request.
 */
export interface StreamingProviderRequest<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  schema: TSchema
  data?: Record<string, unknown>
  signal?: AbortSignal
}

/**
 * Optional metadata that an adapter can surface alongside its byte stream.
 * For example, OpenAI responses may expose token usage stats.
 */
export interface StreamingProviderMetadata {
  meta?: CompletionMeta
}

/**
 * Result returned by a streaming adapter. All adapters must provide
 * a ReadableStream of UTF-8-encoded JSON fragments. Metadata is optional.
 */
export interface StreamingProviderResult extends StreamingProviderMetadata {
  stream: ReadableStream<Uint8Array>
}

/**
 * Provider adapters translate vendor-specific APIs into the schema-first
 * streaming contract expected by the instructor-stream core.
 */
export interface StreamingProviderAdapter<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  start(
    request: StreamingProviderRequest<TSchema>
  ): Promise<StreamingProviderResult> | StreamingProviderResult
}

/**
 * Convenience helper to wrap the legacy `completionPromise` function signature
 * into a proper StreamingProviderAdapter.
 */
export function createFunctionStreamingAdapter<TSchema extends z.ZodTypeAny = z.ZodTypeAny>(
  fn: (
    options: StreamingProviderRequest<TSchema>
  ) => Promise<ReadableStream<Uint8Array>> | ReadableStream<Uint8Array>
): StreamingProviderAdapter<TSchema> {
  return {
    async start(request) {
      const stream = await fn(request)
      return { stream }
    },
  }
}
