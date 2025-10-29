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

export type StreamRequest<A, Tools extends Record<string, Tool.Any> = Record<string, Tool.Any>> = {
  readonly schema: SchemaSource<A>
  readonly prompt: Prompt.RawInput
  readonly validationMode?: SchemaValidationMode
  readonly options?: Partial<Omit<LanguageModel.GenerateTextOptions<Tools>, 'prompt'>>
}

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

export const stub = <A>(schema: SchemaSource<A>, defaultData?: Partial<A>) =>
  Effect.flatMap(SnapshotHydrator, (hydrator) =>
    hydrator.stub({
      schema,
      ...(defaultData !== undefined ? { defaultData } : {}),
    })
  )
