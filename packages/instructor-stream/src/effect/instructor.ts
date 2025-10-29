import { Effect, Stream, Fiber } from 'effect'
import * as Runtime from 'effect/Runtime'
import * as LanguageModel from '@effect/ai/LanguageModel'
import * as Response from '@effect/ai/Response'
import * as Prompt from '@effect/ai/Prompt'
import type * as Tool from '@effect/ai/Tool'
import type { SchemaSource, SchemaValidationMode } from './schema.ts'
import { SnapshotHydrator } from './core/runtime.ts'
import { StreamingError } from './errors.ts'
import type { CompletionMeta } from './core/types.ts'

/**
 * Configuration object for streaming requests with schema validation.
 *
 * @template A - The type of the data structure that will be validated against the schema
 * @template Tools - Record of available tools that can be used during generation, defaults to any tool record
 *
 * @property schema - The schema source used for validating the streamed response data
 * @property prompt - Raw input prompt that will be processed by the language model
 * @property validationMode - Optional mode specifying how schema validation should be performed
 * @property options - Optional partial configuration for language model text generation, excluding the prompt property
 */
export type StreamRequest<A, Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>> = {
  readonly schema: SchemaSource<A>
  readonly prompt: Prompt.RawInput
  readonly validationMode?: SchemaValidationMode
  readonly options?: Partial<Omit<LanguageModel.GenerateTextOptions<Tools>, 'prompt'>>
}

/**
 * Converts a stream of response parts into a provider-compatible ReadableStream with metadata.
 *
 * This function processes various types of stream parts (text deltas, reasoning deltas, finish events, errors)
 * and transforms them into a ReadableStream of bytes while collecting metadata such as token usage and
 * reasoning content.
 *
 * @template R - The environment type required by the stream
 * @template E - The error type that may be produced by the stream
 * @template Tools - A record of tool definitions
 *
 * @param parts - A stream of response parts to be processed
 *
 * @returns An Effect that produces an object containing:
 *   - `stream`: A ReadableStream<Uint8Array> containing encoded text deltas
 *   - `meta`: A function that returns completion metadata including token usage and reasoning content
 *
 * @remarks
 * - Text deltas are encoded and enqueued to the readable stream
 * - Reasoning deltas and endings are accumulated in a buffer
 * - Usage information is captured from finish events
 * - The stream is properly closed or errored based on the input parts
 * - The fiber can be interrupted via the ReadableStream's cancel method
 *
 * @throws {StreamingError} If the language model stream cannot be materialized
 */
const partsToProviderStream = <R, E, Tools extends Record<string, Tool.Any>>(
  parts: Stream.Stream<Response.StreamPart<Tools>, E, R>
) =>
  Effect.gen(function* () {
    const runtime = yield* Effect.runtime<R>()
    const runFork = Runtime.runFork(runtime)
    let usage: Response.Usage | undefined
    let reasoning = ''
    let fiber: Fiber.RuntimeFiber<unknown, unknown> | undefined
    let finished = false
    const encoder = new TextEncoder()
    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        fiber = runFork(
          Stream.runForEach(parts, (part) =>
            Effect.sync(() => {
              switch (part.type) {
                case 'text-delta': {
                  if (part.delta.length > 0) {
                    controller.enqueue(encoder.encode(part.delta))
                  }
                  break
                }
                case 'reasoning-delta': {
                  reasoning += part.delta
                  break
                }
                case 'reasoning-end': {
                  if ('text' in part && typeof part.text === 'string') {
                    reasoning += part.text
                  }
                  break
                }
                case 'finish': {
                  usage = part.usage
                  break
                }
                case 'error': {
                  if (!finished) {
                    finished = true
                    controller.error(part.error)
                  }
                  break
                }
              }
            })
          ).pipe(
            Effect.catchAll((error) =>
              Effect.sync(() => {
                if (!finished) {
                  finished = true
                  controller.error(error)
                }
              })
            ),
            Effect.ensuring(
              Effect.sync(() => {
                if (!finished) {
                  finished = true
                  controller.close()
                }
              })
            )
          )
        )
      },
      cancel() {
        if (fiber) {
          runFork(Fiber.interrupt(fiber))
        }
      },
    })
    const metaSupplier = (): Partial<CompletionMeta> => {
      const meta: Partial<CompletionMeta> = {}
      if (usage) {
        meta.usage = {
          prompt_tokens: usage.inputTokens ?? 0,
          completion_tokens: usage.outputTokens ?? 0,
          total_tokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
        }
      }
      const trimmedReasoning = reasoning.trim()
      if (trimmedReasoning.length > 0) {
        meta.thinking = trimmedReasoning
      }
      return meta
    }
    return { stream: readable, meta: metaSupplier }
  }).pipe(
    Effect.catchAll((cause) =>
      Effect.fail(
        new StreamingError({
          message: 'Unable to materialize language model stream',
          cause,
        })
      )
    )
  )

/**
 * Streams structured data extraction from a language model response.
 *
 * This function takes a stream request containing a prompt and schema, sends it to the language model,
 * and returns a stream of hydrated objects that conform to the provided schema. The stream processes
 * the language model's text output in real-time, validating and transforming it into structured data.
 *
 * @template A - The type of the structured data to extract, inferred from the schema
 * @param request - The stream request configuration
 * @param request.prompt - The prompt to send to the language model
 * @param request.schema - The schema defining the structure of the expected output
 * @param request.options - Optional additional options to pass to the language model
 * @param request.validationMode - Optional validation mode for the hydrator
 *
 * @returns A Stream that emits hydrated objects conforming to the schema
 *
 * @example
 * ```typescript
 * const userStream = stream({
 *   prompt: "Extract user information",
 *   schema: z.object({ name: z.string(), age: z.number() })
 * })
 * ```
 */
export const stream = <A>(request: StreamRequest<A>) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const languageModel = yield* LanguageModel.LanguageModel
      const hydrator = yield* SnapshotHydrator
      const parts = languageModel.streamText({
        prompt: request.prompt,
        ...(request.options ?? {}),
      })
      const providerResult = yield* partsToProviderStream(parts)
      return hydrator.stream({
        schema: request.schema,
        provider: {
          stream: providerResult.stream,
          ...(providerResult.meta ? { meta: providerResult.meta } : {}),
        },
        ...(request.validationMode !== undefined ? { validationMode: request.validationMode } : {}),
      })
    })
  )

/**
 * Creates a stub value based on the provided schema with optional default data.
 *
 * This function generates a stub instance by hydrating a schema through the SnapshotHydrator.
 * The stub can be initialized with partial default data if provided.
 *
 * @template A - The type of the value to be created from the schema
 * @param schema - The schema source defining the structure of the value
 * @param defaultData - Optional partial data to initialize the stub with
 * @returns An Effect that produces a stubbed value conforming to the schema
 *
 * @example
 * ```typescript
 * const userSchema = S.struct({ name: S.string, age: S.number });
 * const userStub = stub(userSchema, { name: "John" });
 * ```
 */
export const stub = <A>(schema: SchemaSource<A>, defaultData?: Partial<A>) =>
  Effect.flatMap(SnapshotHydrator, (hydrator) =>
    hydrator.stub({
      schema,
      ...(defaultData !== undefined ? { defaultData } : {}),
    })
  )
