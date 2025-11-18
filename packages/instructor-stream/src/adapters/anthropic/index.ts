import { Effect, Stream } from 'effect'
import type { StreamRequest } from '@/effect/instructor.ts'
import type { SnapshotChunk } from '@/effect/core/snapshots.ts'
import type { StreamingPipelineError } from '@/effect/errors.ts'
export interface AnthropicAdapterConfig {
  apiKey: string
  model?: string
  baseURL?: string
}
export const createAnthropicStream = <A>(
  _config: AnthropicAdapterConfig,
  _request: Omit<StreamRequest<A>, 'options'> & {
    options?: Partial<Omit<StreamRequest<A>['options'], 'model'>>
  }
): Stream.Stream<SnapshotChunk<A>, StreamingPipelineError> => {
  return Effect.gen(function* () {
    return yield* Effect.fail(
      new Error('Anthropic adapter not yet implemented - Effect AI Anthropic package not available')
    )
  }).pipe(Stream.unwrap)
}
