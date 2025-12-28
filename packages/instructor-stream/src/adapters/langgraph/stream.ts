import { fastAdapter, type LangGraphDelta } from './fast-adapter.ts'
import { SchemaStream } from '@/utils/streaming-json-parser.ts'
import { resolveSchema, type SchemaSource } from '@/effect/schema.ts'
import {
  SchemaResolutionError,
  SnapshotValidationError,
  StreamingError,
  type StreamingPipelineError,
} from '@/effect/errors.ts'
import type { CompletionMeta } from '@/effect'
import type { SnapshotChunk } from '@/effect/core/snapshots.ts'
import { Stream, Effect } from 'effect'

type LangGraphValidationMode = 'none' | 'final'

export type StreamLangGraphSpec<A> = {
  upstream: ReadableStream<unknown>
  schema: SchemaSource<A>
  validation?: LangGraphValidationMode
  onSnapshot?: (snapshot: Partial<A>, meta: CompletionMeta) => void | Promise<void>
  defaultNode?: string
  onMissingNode?: (chunk: unknown) => void
}

const defaultTypeDefaults = {
  string: null,
  number: null,
  boolean: null,
} as const

const toStreamingError = (cause: unknown, message: string): StreamingError =>
  cause instanceof StreamingError ? cause : new StreamingError({ message, cause })

export const streamLangGraph = <A>(spec: StreamLangGraphSpec<A>) => {
  const resolved = resolveSchema(spec.schema)
  if (!resolved.zod) {
    throw new SchemaResolutionError({
      message: `Schema '${resolved.name}' must provide a Zod schema for LangGraph streaming`,
    })
  }

  const validationMode: LangGraphValidationMode = spec.validation ?? 'none'
  const schemaStream = new SchemaStream(resolved.zod, {
    snapshotMode: 'object',
    autoJSONMode: 'off',
    typeDefaults: { ...defaultTypeDefaults },
  })

  const buildMeta = (node: string): CompletionMeta => ({
    _activePath: schemaStream.getActivePath(),
    _completedPaths: schemaStream.getCompletedPaths(),
    _isValid: validationMode === 'none',
    _type: node,
  })

  const adapterOptions: Parameters<typeof fastAdapter>[0] = {}
  if (spec.defaultNode !== undefined) {
    adapterOptions.defaultNode = spec.defaultNode
  }
  if (spec.onMissingNode !== undefined) {
    adapterOptions.onMissingNode = spec.onMissingNode
  }
  const adaptStream = spec.upstream.pipeThrough(fastAdapter(adapterOptions))
  const activeNodes = new Set<string>()

  const iterator = (async function* (): AsyncGenerator<SnapshotChunk<A>, void, unknown> {
    const reader = adaptStream.getReader()
    let ended = false
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          ended = true
          break
        }
        if (!value) continue
        const delta = value as LangGraphDelta
        const { completions, closed } = schemaStream.ingest([delta.node], delta.text)
        if (completions.length === 0) {
          if (closed) {
            schemaStream.releaseContext([delta.node])
            activeNodes.delete(delta.node)
          }
          continue
        }
        activeNodes.add(delta.node)
        yield {
          data: [schemaStream.current() as Partial<A>],
          _meta: buildMeta(delta.node),
        }
        if (closed) {
          schemaStream.releaseContext([delta.node])
          activeNodes.delete(delta.node)
        }
      }

      if (validationMode === 'final') {
        const result = await resolved.zod?.safeParseAsync(schemaStream.current())
        if (!result?.success) {
          throw new SnapshotValidationError({
            reason: `Final validation failed for schema '${resolved.name}'`,
            issues: result?.error?.issues,
          })
        }
      }
    } finally {
      if (!ended) {
        try {
          await reader.cancel()
        } catch {
          // ignore cancellation errors
        }
      }
      try {
        reader.releaseLock()
      } catch {
        // ignore release failures
      }
      for (const node of activeNodes) {
        schemaStream.releaseContext([node])
      }
    }
  })()

  const baseStream = Stream.fromAsyncIterable<SnapshotChunk<A>, StreamingPipelineError>(
    iterator,
    (cause) => {
      if (
        cause instanceof SnapshotValidationError ||
        cause instanceof StreamingError ||
        cause instanceof SchemaResolutionError
      ) {
        return cause
      }
      return toStreamingError(cause, 'LangGraph stream failed')
    }
  )

  if (!spec.onSnapshot) {
    return baseStream
  }

  return Stream.mapEffect(baseStream, (chunk) =>
    Effect.tryPromise({
      try: async () => {
        const snapshot = chunk.data[0]
        await spec.onSnapshot?.(snapshot ?? {}, chunk._meta)
        return chunk
      },
      catch: (cause) => toStreamingError(cause, 'LangGraph onSnapshot handler failed'),
    })
  )
}
