import { Effect, Layer, Stream } from 'effect'
import type { CompletionMeta, ActivePath, CompletedPaths } from './types.ts'
import { SchemaStream } from '@/utils/streaming-json-parser.ts'
import { readableStreamToAsyncGenerator } from '@/utils/streams.ts'
import { resolveSchema, type SchemaSource, type SchemaValidationMode } from '@/effect'
import {
  SchemaResolutionError,
  SnapshotValidationError,
  StreamingError,
  type StreamingPipelineError,
} from '@/effect'
import type { SnapshotChunk } from '@/effect'
import type { Schema } from 'effect/Schema'
import * as SchemaApi from 'effect/Schema'

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

/**
 * Creates a validation function for Effect-based schema validation.
 *
 * @template A - The type of the schema to validate against
 * @param schema - Optional schema to use for validation. If undefined, returns undefined
 * @returns A validation function that returns a Promise<boolean> indicating validation success,
 *          or undefined if no schema was provided. The validation function decodes an unknown value
 *          using the provided schema and returns true if the Effect exits successfully.
 *
 * @example
 * ```typescript
 * const validator = validationForEffect(mySchema);
 * const isValid = await validator({ someData: 'value' }); // true or false
 * ```
 */
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

/**
 * Creates a validation function for a Zod schema.
 *
 * @template A - The type that the Zod schema validates
 * @param schema - The Zod schema to use for validation, or undefined
 * @returns A validation function that returns a Promise<boolean>, or undefined if no schema is provided
 *
 * @remarks
 * The returned validation function performs asynchronous validation using the provided Zod schema's
 * `safeParseAsync` method. It returns `true` if the validation succeeds, `false` otherwise.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const userSchema = z.object({ name: z.string() });
 * const validate = validationForZod(userSchema);
 *
 * if (validate) {
 *   const isValid = await validate({ name: "John" }); // true
 * }
 * ```
 */
const validationForZod = <A>(schema: import('zod').ZodType<A> | undefined) => {
  if (!schema) {
    return undefined
  }
  return async (value: unknown): Promise<boolean> => {
    const result = await schema.safeParseAsync(value)
    return result.success
  }
}

/**
 * Creates a streaming pipeline that hydrates and validates data against a schema.
 *
 * This function takes a schema, provider, and validation mode to create a stream that:
 * 1. Resolves the schema and extracts its Zod representation
 * 2. Parses incoming streaming data according to the schema structure
 * 3. Validates snapshots based on the specified validation mode
 * 4. Enriches each snapshot with metadata including validation status and path information
 *
 * @template A - The type of the data being hydrated
 * @param {HydrationRequest<A>} options - Configuration for the hydration process
 * @param {unknown} options.schema - The schema definition (must be resolvable to a Zod schema)
 * @param {object} options.provider - The data provider containing the source stream and metadata
 * @param {ReadableStream} options.provider.stream - The source stream of data to hydrate
 * @param {ProviderMeta | (() => ProviderMeta)} [options.provider.meta] - Metadata supplier for the provider
 * @param {string} [options.provider.channelType] - Optional channel type override
 * @param {'none' | 'on-complete' | 'final'} [options.validationMode='none'] - Validation strategy:
 *   - 'none': Skip validation, mark all snapshots as valid
 *   - 'on-complete': Validate when a schema path is completed
 *   - 'final': Only validate the final snapshot during stream flush
 * @returns {Stream.Stream<SnapshotChunk<A>, StreamingPipelineError, never>} An Effect Stream that emits validated snapshot chunks with metadata
 * @throws {SchemaResolutionError} When the schema cannot be resolved to a Zod schema
 * @throws {StreamingError} When the streaming pipeline encounters an error
 * @throws {SnapshotValidationError} When final validation fails in 'final' mode
 */
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

  /**
   * A function that supplies metadata for the provider.
   *
   * If `provider.meta` is a function, it uses that function directly.
   * Otherwise, it wraps the static `provider.meta` value (or an empty object if undefined)
   * in a function that returns it.
   *
   * @returns A function that returns the provider's metadata
   */
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
  /**
   * Creates a new SchemaStream instance configured to parse and validate streaming data against a Zod schema.
   *
   * The stream operates in 'object' snapshot mode and provides null as default values for primitive types.
   * Tracks the active parsing path and completed paths through the schema structure, triggering validation
   * when new paths are completed.
   *
   * @remarks
   * - Uses snapshot mode 'object' to capture intermediate parsing states
   * - Null defaults are set for string, number, and boolean types during parsing
   * - The onKeyComplete callback updates tracking variables when schema paths are completed
   * - Triggers pending validation flag when new paths complete to enable validation of completed portions
   *
   * @see {@link SchemaStream} for the underlying stream implementation
   *
   * - Completed paths tracking (`_completedPaths`)
   * - Channel type information (`_type`)
   *
   * @throws {StreamingError} When snapshot processing fails during transformation
   * @throws {SnapshotValidationError} When final validation fails during the flush phase
   */
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

  /**
   * A TransformStream that handles validation and metadata enrichment for streaming snapshots.
   *
   * This stream processes partial snapshots of type `A` and transforms them into `SnapshotChunk<A>`
   * objects with validation results and completion metadata.
   *
   * @remarks
   * The stream supports three validation modes:
   * - `'on-complete'`: Validates when a completion signal is received
   * - `'none'`: Skips validation and marks all snapshots as valid
   * - `'final'`: Validates only the final snapshot in the flush phase
   *
   * Validation can be performed using either Effect or Zod validators if provided.
   * Each transformed chunk includes:
   * - The original snapshot data
   * - Validation status (`_isValid`)
   * - Active path tracking (`_activePath`)
   * - Completed paths tracking (`_completedPaths`)
   * - Channel type information (`_type`)
   *
   * @throws {StreamingError} When snapshot processing fails during transformation
   * @throws {SnapshotValidationError} When final validation fails during the flush phase
   */
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
          _meta: meta,
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
        _meta: meta,
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

/**
 * Builds a partial stub object based on a provided schema and default data.
 *
 * This function resolves the given schema, extracts its Zod schema representation,
 * and generates a stub object with default values. The stub is created using
 * SchemaStream with null defaults for primitive types (string, number, boolean).
 *
 * @template A - The type of the object to be stubbed
 * @param {StubRequest<A>} params - The stub request configuration
 * @param {unknown} params.schema - The schema to resolve and use for stub generation
 * @param {A} [params.defaultData] - Optional default data to merge into the stub
 * @returns {Partial<A>} A partial object conforming to type A with stub values
 * @throws {SchemaResolutionError} When the schema cannot be resolved to a Zod schema
 *
 * @example
 * ```typescript
 * const stub = buildStub({
 *   schema: mySchema,
 *   defaultData: { name: 'John' }
 * });
 * ```
 */
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

/**
 * Service for hydrating and constructing streaming pipelines and schema stubs.
 *
 * Provides two main operations:
 * - `stream`: Creates a streaming pipeline from a hydration request by unwrapping and hydrating the data
 * - `stub`: Builds a schema stub from a stub request for type validation purposes
 *
 * @remarks
 * Both operations handle errors by wrapping them in a `StreamingError` with descriptive messages.
 * The service is registered under the identifier 'instructor/streaming/SnapshotHydrator'.
 *
 * @example
 * ```typescript
 * const hydrator = yield* SnapshotHydrator;
 * const dataStream = hydrator.stream(request);
 * const schemaStub = yield* hydrator.stub(stubRequest);
 * ```
 */
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
