import { langgraphAdapter } from './adapter.ts'
import { SnapshotHydrator, SnapshotHydratorLayer } from '@/effect'
import type { CompletionMeta, StreamingPipelineError, StreamingValidationMode } from '@/effect'
import { z } from 'zod'
import { Effect, Stream } from 'effect'

type NodePipeline = {
  writer: WritableStreamDefaultWriter<string>
  close: () => Promise<void>
}

export type ChannelSpec = {
  upstream: ReadableStream<unknown>
  schemas: Record<string, z.ZodType>
  defaultSchema?: z.ZodType
  onSnapshot: (node: string, snapshot: unknown, meta: CompletionMeta) => void | Promise<void>
  validationMode?: StreamingValidationMode
  failFast?: boolean
}

const encoder = new TextEncoder()

/**
 * Creates a processing pipeline for streaming data through a validation schema.
 *
 * This function sets up a transform stream that:
 * 1. Strips leading content before the first JSON object or array
 * 2. Pipes chunks through a schema validation hydrator
 * 3. Invokes a snapshot callback for each validated chunk
 *
 * @param node - The name/identifier of the node in the graph
 * @param schema - The Zod schema used to validate and parse streaming data
 * @param onSnapshot - Callback invoked with each validated snapshot: `(node, data, meta) => void`
 * @param validationMode - The validation mode for the streaming pipeline (e.g., 'partial', 'strict', 'none')
 * @param errors - Array to collect any errors that occur during pipeline processing
 *
 * @returns A NodePipeline object containing:
 *   - `writer`: A WritableStreamDefaultWriter to write chunks into the pipeline
 *   - `close`: Async function to close the writer and wait for processing to complete
 *
 * @remarks
 * The pipeline automatically strips any content before the first `{` or `[` character
 * to handle cases where the stream contains a preamble. Errors during processing are
 * pushed to the provided `errors` array rather than thrown.
 *
 * @internal
 */
const createPipeline = (
  node: string,
  schema: z.ZodType,
  onSnapshot: ChannelSpec['onSnapshot'],
  validationMode: StreamingValidationMode,
  errors: unknown[]
): NodePipeline => {
  let started = false
  const chunkTransform = new TransformStream<string, Uint8Array>({
    transform(chunk, controller) {
      if (!started) {
        const idx = chunk.search(/[{\[]/)
        if (idx === -1) {
          return
        }
        if (idx > 0) {
          chunk = chunk.slice(idx)
        }
        started = true
      }
      controller.enqueue(encoder.encode(chunk))
    },
  })
  const writer = chunkTransform.writable.getWriter()
  const schemaSource = { name: node, zod: schema } as const

  const processing = (async () => {
    try {
      const program = Effect.gen(function* () {
        const hydrator = yield* SnapshotHydrator
        const stream = hydrator.stream({
          schema: schemaSource,
          provider: {
            stream: chunkTransform.readable,
            meta: { _type: node } as Partial<CompletionMeta>,
          },
          ...(validationMode !== 'none' ? { validationMode } : {}),
        })
        yield* Stream.runForEach(stream, (snapshot) =>
          Effect.promise(async () => {
            await onSnapshot(node, snapshot.data[0], snapshot.meta)
          })
        )
      })
      // Effect.Service layers currently leave the service requirement in the inferred environment.
      // Type assertion documents the intended erasure until upstream typings are updated.
      const runnable = program.pipe(
        Effect.provide(SnapshotHydratorLayer),
        Effect.scoped
      ) as Effect.Effect<void, StreamingPipelineError, never>
      await Effect.runPromise(runnable)
    } catch (error) {
      errors.push(error)
    }
  })()
  return {
    writer,
    close: async () => {
      try {
        await writer.close()
      } catch {
        // ignore close failures
      }
      await processing
    },
  }
}

/**
 * Consumes a stream of LangGraph channel events and processes them through node-specific pipelines.
 *
 * This function reads from an upstream readable stream, adapts the data using a LangGraph adapter,
 * and routes chunks to appropriate node pipelines based on the channel specification. Each node
 * can have a specific schema or fall back to a default schema for validation and processing.
 *
 * @param spec - The channel specification containing:
 *   - `upstream`: The source ReadableStream to consume
 *   - `schemas`: A map of node names to their validation schemas
 *   - `defaultSchema`: Optional fallback schema for nodes without specific schemas
 *   - `onSnapshot`: Optional callback function invoked when a snapshot is available
 *   - `validationMode`: Optional validation mode ('none', 'validate', etc.). Defaults to 'none'
 *   - `failFast`: Optional flag to throw on first error. Defaults to false
 *
 * @throws {unknown} The first error encountered if `failFast` is true and errors occurred
 *
 * @returns A promise that resolves when the stream has been fully consumed and all pipelines closed
 *
 * @example
 * ```typescript
 * await consumeLanggraphChannels({
 *   upstream: myStream,
 *   schemas: {
 *     'agent': agentSchema,
 *     'tool': toolSchema
 *   },
 *   defaultSchema: fallbackSchema,
 *   onSnapshot: (node, data) => console.log(`Snapshot from ${node}:`, data),
 *   validationMode: 'validate',
 *   failFast: true
 * });
 * ```
 */
export async function consumeLanggraphChannels(spec: ChannelSpec): Promise<void> {
  const validationMode = spec.validationMode ?? 'none'
  const failFast = spec.failFast ?? false
  const pipelines = new Map<string, NodePipeline>()
  const errors: unknown[] = []
  const reader = spec.upstream.pipeThrough(langgraphAdapter()).getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      const { node, chunk } = value as { node: string; chunk: string }
      const schema = spec.schemas[node] ?? spec.defaultSchema
      if (!schema) {
        continue
      }
      let pipeline = pipelines.get(node)
      if (!pipeline) {
        pipeline = createPipeline(node, schema, spec.onSnapshot, validationMode, errors)
        pipelines.set(node, pipeline)
      }
      await pipeline.writer.write(chunk)
    }
  } finally {
    reader.releaseLock()
    await Promise.all([...pipelines.values()].map((pipeline) => pipeline.close()))
  }
  if (errors.length > 0 && failFast) {
    throw errors[0]
  }
}
