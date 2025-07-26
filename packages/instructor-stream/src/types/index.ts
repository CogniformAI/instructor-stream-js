import OpenAI from 'openai'
import { Stream } from 'openai/streaming'
import { z } from 'zod'
import { MODE } from '@/constants'

export type ActivePath = (string | number | undefined)[]
export type CompletedPaths = ActivePath[]
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface BaseCompletionMeta {
  /** The path that is currently being generated */
  _activePath: ActivePath
  /** This is a list of all paths that have been generated in the order they were generated */
  _completedPaths: CompletedPaths
  /** Not sure of the use of this will need to look closer at it */
  _isValid: boolean
  /** This is a convenient way to access states of the completions this can be dynamically set. */
  _type?: string
}

/** This may just get merged into BaseCompletionMeta */
export type CompletionMeta = Partial<BaseCompletionMeta> & {
  /** Usage statistics when available, only supports OpenAI currently */
  usage?: OpenAI.CompletionUsage
  /** Free‑form "thinking" text streamed in THINKING_MD_JSON mode */
  thinking?: string
}
/**
 * @description This is the updated streaming data shape.
 * The advantage of having a shape like this is that it is better dx
 * to separate the meta data from the actual data. This shape is
 * also more consistent whether you return a single object or an array
 * of objects. - This is the main reason for this fork.
 */
export type StreamChunk<T> = {
  data: Partial<T>[]
  _meta: CompletionMeta
}

/**
 * Once the basic refactor is dont we will tackle creating a single
 * interface for Intructor-Stream and use provider adapers instead
 * This will hopefully make this more modular with an easier way to
 * and more reliable way to use this library.
 */
export type GenericCreateParams<M = unknown> = Omit<
  Partial<OpenAI.ChatCompletionCreateParams>,
  'model' | 'messages'
> & {
  model: string
  messages: M[]
  stream?: boolean
  max_tokens?: number | null
  [key: string]: unknown
}

export type GenericRequestOptions = Partial<OpenAI.RequestOptions> & {
  [key: string]: unknown
}

export type GenericChatCompletion<T = unknown> = Partial<OpenAI.Chat.Completions.ChatCompletion> & {
  [key: string]: unknown
  choices?: T
}

export type GenericChatCompletionStream<T = unknown> = AsyncIterable<
  Partial<OpenAI.Chat.Completions.ChatCompletionChunk> & {
    [key: string]: unknown
    choices?: T
  }
>

export type GenericClient = {
  [key: string]: unknown
  baseURL?: string
  chat?: {
    completions?: {
      create?: <P extends GenericCreateParams>(params: P) => Promise<unknown>
    }
  }
}

export type ClientTypeChatCompletionParams<C> =
  C extends OpenAI ? OpenAI.ChatCompletionCreateParams : GenericCreateParams

export type ClientTypeChatCompletionRequestOptions<C> =
  C extends OpenAI ? OpenAI.RequestOptions : GenericRequestOptions

export type ClientType<C> =
  C extends OpenAI ? 'openai'
  : C extends GenericClient ? 'generic'
  : never

export type OpenAILikeClient<C> = OpenAI | (C & GenericClient)
export type SupportedInstructorClient = GenericClient | OpenAI

export type ClientConfig = {
  debug?: boolean
}

export type ParseParams = {
  name: string
  description?: string
}

export type ResponseModel<T extends z.ZodType> = {
  schema: T
  name: string
  description?: string
}

export type Mode = keyof typeof MODE | 'THINKING_MD_JSON'

export interface InstructorConfig<C> {
  client: C
  mode: Mode
  debug?: boolean
  logger?: <T extends unknown[]>(level: LogLevel, ...args: T) => void
  retryAllErrors?: boolean
}

export type InstructorChatCompletionParams<T extends z.ZodType> = {
  response_model: ResponseModel<T>
  max_retries?: number
}

export type ChatCompletionCreateParamsWithModel<T extends z.ZodType> =
  InstructorChatCompletionParams<T> & GenericCreateParams

export type ReturnTypeBasedOnParams<C, P> =
  P extends { stream: true; response_model: ResponseModel<infer T> } ?
    AsyncGenerator<{ data: Partial<z.output<T>>[]; _meta: CompletionMeta }, void, unknown>
  : P extends { response_model: ResponseModel<infer T> } ?
    Promise<{ data: z.output<T>[]; _meta: CompletionMeta }>
  : C extends OpenAI ?
    P extends { stream: true } ?
      Stream<OpenAI.Chat.Completions.ChatCompletionChunk>
    : OpenAI.Chat.Completions.ChatCompletion
  : Promise<unknown>

export type ZodStreamCompletionParams<T extends z.ZodType> = {
  response_model: { schema: T }
  data?: Record<string, unknown>
  completionPromise: (data?: Record<string, unknown>) => Promise<ReadableStream<Uint8Array>>
}

export type InferStreamType<T extends OpenAI.ChatCompletionCreateParams> =
  T extends { stream: true } ? OpenAI.ChatCompletionCreateParamsStreaming
  : OpenAI.ChatCompletionCreateParamsNonStreaming

export type FunctionParamsReturnType<T extends OpenAI.ChatCompletionCreateParams> = T & {
  function_call: OpenAI.ChatCompletionFunctionCallOption
  functions: OpenAI.FunctionDefinition[]
}

export type ToolFunctionParamsReturnType<T extends OpenAI.ChatCompletionCreateParams> = T & {
  tool_choice: OpenAI.ChatCompletionToolChoiceOption
  tools: OpenAI.ChatCompletionTool[]
}

export type MessageBasedParamsReturnType<T extends OpenAI.ChatCompletionCreateParams> = T

export type JsonModeParamsReturnType<T extends OpenAI.ChatCompletionCreateParams> = T & {
  response_format: { type: 'json_object' }
  messages: OpenAI.ChatCompletionMessageParam[]
}

export type JsonSchemaParamsReturnType<
  T extends Omit<OpenAI.ChatCompletionCreateParams, 'response_format'>,
> = T & {
  response_format: {
    type: 'json_object'
    schema: unknown
  }
  messages: OpenAI.ChatCompletionMessageParam[]
}

export type ModeParamsReturnType<T extends OpenAI.ChatCompletionCreateParams, M extends Mode> =
  M extends typeof MODE.FUNCTIONS ? FunctionParamsReturnType<T>
  : M extends typeof MODE.TOOLS ? ToolFunctionParamsReturnType<T>
  : M extends typeof MODE.JSON ? JsonModeParamsReturnType<T>
  : M extends typeof MODE.JSON_SCHEMA ? JsonSchemaParamsReturnType<T>
  : M extends typeof MODE.MD_JSON ? MessageBasedParamsReturnType<T>
  : MessageBasedParamsReturnType<T>

export type ZCompletionMeta = BaseCompletionMeta
export type ZMode = keyof typeof MODE
export type ZResponseModel<T extends z.ZodType> = ResponseModel<T>
