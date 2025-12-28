import type { SchemaValidationMode } from '@/effect'

export type ActivePath = (string | number | undefined)[]
export type CompletedPaths = ActivePath[]

export interface BaseCompletionMeta {
  _activePath: ActivePath
  _completedPaths: CompletedPaths
  _isValid: boolean
  _type?: string
}

export type TokenUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export type CompletionMeta = Partial<BaseCompletionMeta> & {
  usage?: TokenUsage
  thinking?: string
}

export type StreamingValidationMode = SchemaValidationMode
