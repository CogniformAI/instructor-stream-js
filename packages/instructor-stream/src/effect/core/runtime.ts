import { Effect, Layer, Stream } from 'effect'
import type { CompletionMeta, ActivePath, CompletedPaths } from './types.ts'
import { SchemaStream } from '@/utils/streaming-json-parser.ts'
import { readableStreamToAsyncGenerator } from '@/utils/streams.ts'
import { resolveSchema, type SchemaSource, type SchemaValidationMode } from '../schema.ts'
import {
  SchemaResolutionError,
  SnapshotValidationError,
  StreamingError,
  type StreamingPipelineError,
} from '../errors.ts'
import type { SnapshotChunk } from './snapshots.ts'
import type { Schema } from '@effect/schema/Schema'
import * as SchemaApi from '@effect/schema/Schema'

type ProviderMeta = Partial<CompletionMeta>

type ProviderStreamResult = {
  readonly stream: ReadableStream<Uint8Array>
  readonly meta?: ProviderMeta | (() => ProviderMeta)
  readonly channelType?: string
}

type HydrationRequest<A> = {
  readonly schema: SchemaSource<A>
  readonly provider: ProviderStreamResult
  readonly validationMode?: SchemaValidationMode
}

type StubRequest<A> = {
  readonly schema: SchemaSource<A>
  readonly defaultData?: Partial<A>
}

type SnapshotHydratorService = {
  readonly stream: <A>(
    request: HydrationRequest<A>
  ) => Stream.Stream<SnapshotChunk<A>, StreamingPipelineError, never>
  readonly stub: <A>(
    request: StubRequest<A>
  ) => Effect.Effect<Partial<A>, StreamingPipelineError, never>
}

const validationForEffect = <A>(schema: Schema<A> | undefined) => {
  if (!schema) {
    return undefined
  }
  const decode = SchemaApi.decodeUnknown(schema)
  return async (value: unknown): Promise<boolean> => {
    const exit = await Effect.runPromiseExit(decode(value))
    return exit._tag === 'Success'
  }
}

const validationForZod = <A>(schema: import('zod').ZodType<A> | undefined) => {
  if (!schema) {
    return undefined
  }
  return async (value: unknown): Promise<boolean> => {
    const result = await schema.safeParseAsync(value)
    return result.success
  }
}

const hydrate = <A>({
  schema,
  provider,
  validationMode = 'none',
}: HydrationRequest<A>): Stream.Stream<SnapshotChunk<A>, StreamingPipelineError, never> => {
  const resolved = resolveSchema(schema)
  const zodSchema = resolved.zod
  if (!zodSchema) {
    throw new SchemaResolutionError({
      message: `Schema '${resolved.name}' requires a Zod schema for streaming stub generation.`,
    })
  }

  const validateWithEffect = validationForEffect(resolved.effect)
  const validateWithZod = validationForZod(zodSchema)

  const metaSupplier =
    typeof provider.meta === 'function' ?
      (provider.meta as () => ProviderMeta)
    : () => provider.meta ?? {}

  let activePath: ActivePath = []
  let completedPaths: CompletedPaths = []
  let completedPathCount = 0
  let pendingOnCompleteValidation = false
  let lastSnapshot: Partial<A> | null = null
  let lastValidationResult = true

  const schemaStream = new SchemaStream(zodSchema, {
    snapshotMode: 'object',
    typeDefaults: {
      string: null,
      number: null,
      boolean: null,
    },
    onKeyComplete: ({ activePath: nextActivePath, completedPaths: nextCompletedPaths }) => {
      activePath = [...nextActivePath]
      completedPaths = nextCompletedPaths.map((path) =>
        Array.isArray(path) ? [...path] : ([] as CompletedPaths[number])
      )
      if (nextCompletedPaths.length > completedPathCount) {
        pendingOnCompleteValidation = true
        completedPathCount = nextCompletedPaths.length
      }
    },
  })

  const parser = schemaStream.parse({
    handleUnescapedNewLines: true,
  })

  const validationStream = new TransformStream<Partial<A>, SnapshotChunk<A>>({
    async transform(snapshot, controller) {
      lastSnapshot = snapshot
      try {
        if (validationMode === 'on-complete' && pendingOnCompleteValidation) {
          if (validateWithEffect) {
            lastValidationResult = await validateWithEffect(snapshot)
          } else if (validateWithZod) {
            lastValidationResult = await validateWithZod(snapshot)
          } else {
            lastValidationResult = true
          }
          pendingOnCompleteValidation = false
        } else if (validationMode === 'none') {
          lastValidationResult = true
        }

        const baseMeta = metaSupplier() as CompletionMeta
        const channelType = provider.channelType ?? baseMeta._type
        const meta: CompletionMeta = {
          ...baseMeta,
          _isValid: validationMode === 'none' ? true : lastValidationResult,
          _activePath: activePath,
          _completedPaths: completedPaths,
          ...(channelType !== undefined ? { _type: channelType } : {}),
        }

        controller.enqueue({
          data: [snapshot],
          meta,
        })
      } catch (error) {
        controller.error(
          new StreamingError({
            message: 'Failed to process streaming snapshot',
            cause: error,
          })
        )
      }
    },
    async flush(controller) {
      if (!lastSnapshot || validationMode !== 'final') {
        return
      }
      try {
        if (validateWithEffect) {
          lastValidationResult = await validateWithEffect(lastSnapshot)
        } else if (validateWithZod) {
          lastValidationResult = await validateWithZod(lastSnapshot)
        } else {
          lastValidationResult = true
        }
      } catch (error) {
        controller.error(
          new SnapshotValidationError({
            reason: 'Final validation failed',
            issues: error,
          })
        )
        return
      }
      const baseMeta = metaSupplier() as CompletionMeta
      const channelType = provider.channelType ?? baseMeta._type
      const meta: CompletionMeta = {
        ...baseMeta,
        _isValid: lastValidationResult,
        _activePath: activePath,
        _completedPaths: completedPaths,
        ...(channelType !== undefined ? { _type: channelType } : {}),
      }
      controller.enqueue({
        data: [lastSnapshot],
        meta,
      })
    },
  })

  const validatedStream = provider.stream.pipeThrough(parser).pipeThrough(validationStream)
  const generator = readableStreamToAsyncGenerator(validatedStream) as AsyncGenerator<
    SnapshotChunk<A>
  >

  return Stream.fromAsyncIterable<SnapshotChunk<A>, StreamingPipelineError>(
    generator,
    (cause) =>
      new StreamingError({
        message: 'Streaming pipeline failed',
        cause,
      })
  )
}

const buildStub = <A>({ schema, defaultData }: StubRequest<A>): Partial<A> => {
  const resolved = resolveSchema(schema)
  const zodSchema = resolved.zod
  if (!zodSchema) {
    throw new SchemaResolutionError({
      message: `Schema '${resolved.name}' requires a Zod schema to derive default streaming stubs.`,
    })
  }
  const initialDefaults = defaultData as Record<string, unknown> | undefined
  const schemaStream = new SchemaStream(zodSchema, {
    defaultData: initialDefaults as never,
    typeDefaults: {
      string: null,
      number: null,
      boolean: null,
    },
  })
  return schemaStream.getSchemaStub(zodSchema, initialDefaults as never) as Partial<A>
}

export class SnapshotHydrator extends Effect.Service<SnapshotHydratorService>()(
  'instructor/streaming/SnapshotHydrator',
  {
    effect: Effect.sync(() => ({
      stream: <A>(request: HydrationRequest<A>) =>
        Stream.unwrap(
          Effect.try({
            try: () => hydrate(request),
            catch: (cause) =>
              new StreamingError({
                message: 'Unable to construct streaming pipeline',
                cause,
              }),
          })
        ),
      stub: <A>(request: StubRequest<A>) =>
        Effect.try({
          try: () => buildStub(request),
          catch: (cause) =>
            new StreamingError({
              message: 'Unable to construct schema stub',
              cause,
            }),
        }),
    })),
  }
) {}

export const SnapshotHydratorLayer: Layer.Layer<SnapshotHydrator> = SnapshotHydrator.Default
