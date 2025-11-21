import { Layer, Redacted } from 'effect'
import { OpenAiClient, OpenAiLanguageModel } from '@effect/ai-openai'
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient'
import { SnapshotHydratorLayer } from '@/effect/core/runtime.ts'
export interface OpenAIAdapterConfig {
  apiKey: string
  model?: string
  baseURL?: string
}
export const createOpenAILayers = (config: OpenAIAdapterConfig) => {
  const clientLayer = OpenAiClient.layer({
    apiKey: Redacted.make(config.apiKey),
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  })
  const modelLayer = OpenAiLanguageModel.layer({
    model: config.model ?? 'gpt-4o-mini',
  })
  return Layer.mergeAll(SnapshotHydratorLayer, NodeHttpClient.layer, clientLayer, modelLayer)
}
