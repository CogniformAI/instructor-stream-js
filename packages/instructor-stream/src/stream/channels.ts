import ZodStream from './structured-stream.client.ts'
import { langgraphAdapter } from './adapters/langgraph-adapter.ts'
import { createFunctionStreamingAdapter } from '@/adapters/streaming-provider-adapter.ts'
import { type CompletionMeta, type StreamingValidationMode } from '@/types'
import { z } from 'zod'

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
  const adapter = createFunctionStreamingAdapter(async () => chunkTransform.readable)
  const zodStream = new ZodStream()
  const generatorTask = (async () => {
    const generator = await zodStream.create({
      adapter,
      response_model: { schema },
      channelType: node,
      validationMode,
    })
    for await (const snapshot of generator) {
      const data = snapshot.data[0]
      await onSnapshot(node, data, snapshot._meta)
    }
  })().catch((error) => {
    errors.push(error)
  })

  return {
    writer,
    close: async () => {
      try {
        await writer.close()
      } catch {
        // ignore close failures
      }
      await generatorTask
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
