import { Effect, Layer, Stream, Redacted } from 'effect'
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai'
import { stream, type StreamRequest } from '@/effect/instructor.ts'
import type { SnapshotChunk } from '@/effect/core/snapshots.ts'
import type { StreamingPipelineError } from '@/effect/errors.ts'
export interface OpenAIAdapterConfig {
  apiKey: string
  model?: string
  baseURL?: string
}
export const createOpenAIStream = <A>(
  config: OpenAIAdapterConfig,
  request: Omit<StreamRequest<A>, 'options'> & {
    options?: Partial<Omit<StreamRequest<A>['options'], 'model'>>
  }
): Stream.Stream<SnapshotChunk<A>, StreamingPipelineError> => {
  const clientLayer = OpenAiClient.layer({
    apiKey: Redacted.make(config.apiKey),
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  })
  const modelLayer = OpenAiLanguageModel.layer({
    model: config.model ?? 'gpt-4o',
  })
  const layers = Layer.mergeAll(clientLayer, modelLayer)
  return stream(request).pipe(Effect.provide(layers), Stream.unwrap)
}
