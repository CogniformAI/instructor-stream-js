import * as Data from '@effect/data/Data'

export class ProviderError extends Data.TaggedClass('ProviderError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class StreamingError extends Data.TaggedClass('StreamingError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

export class SchemaResolutionError extends Data.TaggedClass('SchemaResolutionError')<{
  readonly message: string
}> {}

export class SnapshotValidationError extends Data.TaggedClass('SnapshotValidationError')<{
  readonly reason: string
  readonly issues?: unknown
}> {}

export type StreamingPipelineError =
  | ProviderError
  | StreamingError
  | SchemaResolutionError
  | SnapshotValidationError
