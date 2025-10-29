import type { CompletionMeta } from './types.ts'

export type SnapshotChunk<A> = {
  readonly data: ReadonlyArray<Partial<A>>
  readonly meta: CompletionMeta
}
