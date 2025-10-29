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
