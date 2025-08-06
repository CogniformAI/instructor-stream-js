import OpenAI from 'openai'
import { Stream } from 'openai/streaming'
import { z, ZodError } from 'zod'
import { fromZodError } from 'zod-validation-error'
import {
  MODE_TO_RESPONSE_PARSER,
  NON_OAI_PROVIDER_URLS,
  Provider,
  PROVIDER_PARAMS_TRANSFORMERS,
  PROVIDER_SUPPORTED_MODES,
  PROVIDERS,
} from './constants/providers.ts'
import { iterableTee } from './lib'
import { OAIResponseParser, OAIStream, withResponseModel } from './stream'
import ZodStream from './stream/structured-stream.client.js'
import {
  ChatCompletionCreateParamsWithModel,
  ClientTypeChatCompletionParams,
  ClientTypeChatCompletionRequestOptions,
  CompletionMeta,
  GenericChatCompletion,
  GenericClient,
  InstructorConfig,
  LogLevel,
  Mode,
  OpenAILikeClient,
  ReturnTypeBasedOnParams,
} from './types'
import {
  ValidationError,
  RetryableError,
  NonRetryableError,
  UnsupportedClientError,
} from './errors'

const MAX_RETRIES_DEFAULT = 0

/**
 * The Instructor class provides a unified interface for interacting with OpenAI-like clients,
 * supporting both standard and streaming chat completions with schema validation and error handling.
 * It manages provider-specific options, logging, and retry logic for robust API usage.
 */
class Instructor<C> {
  readonly client: OpenAILikeClient<C>
  readonly mode: Mode
  readonly provider: Provider
  readonly debug: boolean = false
  readonly retryAllErrors: boolean = false
  readonly logger?: <T extends unknown[]>(level: LogLevel, ...args: T) => void

  /**
   * Initializes a new Instructor instance for a given OpenAI-like client and configuration.
   * Validates the client and sets up provider-specific options and logging.
   *
   * Args:
   *   client (OpenAILikeClient): The OpenAI-compatible client instance.
   *   mode (Mode): The operation mode for completions.
   *   debug (boolean, optional): Enables debug logging if true.
   *   logger (function, optional): Custom logger function.
   *   retryAllErrors (boolean, optional): If true, retries all errors.
   */
  constructor({
    client,
    mode,
    debug = false,
    logger = undefined,
    retryAllErrors = false,
  }: InstructorConfig<C>) {
    if (!isGenericClient(client) && !(client instanceof OpenAI)) {
      throw new UnsupportedClientError('Client does not match the required structure')
    }
    if (client instanceof OpenAI) {
      this.client = client as OpenAI
    } else {
      this.client = client as C & GenericClient
    }
    this.mode = mode
    this.debug = debug
    this.retryAllErrors = retryAllErrors
    this.logger = logger ?? undefined
    this.provider =
      typeof this.client?.baseURL === 'string' ?
        this.client?.baseURL.includes(NON_OAI_PROVIDER_URLS.ANYSCALE) ? PROVIDERS.ANYSCALE
        : this.client?.baseURL.includes(NON_OAI_PROVIDER_URLS.TOGETHER) ? PROVIDERS.TOGETHER
        : this.client?.baseURL.includes(NON_OAI_PROVIDER_URLS.OAI) ? PROVIDERS.OAI
        : this.client?.baseURL.includes(NON_OAI_PROVIDER_URLS.ANTHROPIC) ? PROVIDERS.ANTHROPIC
        : this.client?.baseURL.includes(NON_OAI_PROVIDER_URLS.GROQ) ? PROVIDERS.GROQ
        : PROVIDERS.OTHER
      : PROVIDERS.OTHER
    this.validateOptions()
  }

  /**
   * Validates the current provider and mode configuration.
   * Logs warnings if the mode is not supported by the provider.
   */
  private validateOptions() {
    const isModeSupported = PROVIDER_SUPPORTED_MODES[this.provider].includes(this.mode)
    if (this.provider === PROVIDERS.OTHER) {
      this.log('debug', 'Unknown provider - cant validate options.')
    }
    if (!isModeSupported) {
      this.log('warn', `Mode ${this.mode} may not be supported by provider ${this.provider}`)
    }
  }

  /**
   * Logs messages at the specified log level using the configured logger or console.
   * Skips debug logs if debug mode is disabled.
   *
   * Args:
   *   level (LogLevel): The severity level of the log.
   *   ...args: Additional arguments to log.
   */
  private log<T extends unknown[]>(level: LogLevel, ...args: T) {
    if (this.logger) {
      this.logger(level, ...args)
    }
    if (!this.debug && level === 'debug') {
      return
    }
    const timestamp = new Date().toISOString()
    switch (level) {
      case 'debug':
        console.debug(`[Instructor:DEBUG] ${timestamp}:`, ...args)
        break
      case 'info':
        console.info(`[Instructor:INFO] ${timestamp}:`, ...args)
        break
      case 'warn':
        console.warn(`[Instructor:WARN] ${timestamp}:`, ...args)
        break
      case 'error':
        console.error(`[Instructor:ERROR] ${timestamp}:`, ...args)
        break
    }
  }

  /**
   * Executes a standard (non-streaming) chat completion with schema validation and retry logic.
   * Returns the validated response data and associated metadata.
   *
   * Args:
   *   params (ChatCompletionCreateParamsWithModel): Parameters for the chat completion, including the response model.
   *   requestOptions (optional): Additional request options for the client.
   *
   * Returns:
   *   Promise<{ data: z.output<T>[]; _meta: CompletionMeta }>: The validated completion data and metadata.
   *
   * Raises:
   *   ValidationError: If the response does not match the schema.
   *   RetryableError: If a retryable error occurs during completion.
   *   NonRetryableError: If a non-retryable error occurs.
   */
  private async chatCompletionStandard<T extends z.ZodType>(
    {
      max_retries = MAX_RETRIES_DEFAULT,
      response_model,
      ...params
    }: ChatCompletionCreateParamsWithModel<T>,
    requestOptions?: ClientTypeChatCompletionRequestOptions<C>
  ): Promise<{ data: z.output<T>[]; _meta: CompletionMeta }> {
    let attempts = 0
    let validationIssues = ''
    let lastMessage: OpenAI.ChatCompletionMessageParam | null = null
    const paramsTransformer = (
      PROVIDER_PARAMS_TRANSFORMERS?.[this.provider] as Record<string, unknown> | undefined
    )?.[this.mode as unknown as string] as ((p: unknown) => unknown) | undefined
    let completionParams = withResponseModel({
      params: {
        ...params,
        stream: params.stream ?? false,
      } as OpenAI.ChatCompletionCreateParams,
      mode: this.mode,
      response_model,
    })
    if (typeof paramsTransformer === 'function') {
      completionParams = paramsTransformer(completionParams as unknown) as typeof completionParams
    }

    const makeCompletionCall = async () => {
      let resolvedParams = completionParams
      if (validationIssues?.length > 0) {
        resolvedParams = {
          ...completionParams,
          messages: [
            ...completionParams.messages,
            ...(lastMessage ? [lastMessage] : []),
            {
              role: 'user',
              content: `Please correct the function call; errors encountered:\n ${validationIssues}`,
            },
          ],
        }
      }
      let completion
      try {
        if (this.client.chat?.completions?.create) {
          const result = await this.client.chat.completions.create(
            {
              ...resolvedParams,
              stream: false,
            },
            requestOptions
          )
          completion = result as GenericChatCompletion<typeof result>
        } else {
          throw new UnsupportedClientError('Unsupported client type -- no completion method found.')
        }
        this.log('debug', 'raw standard completion response: ', completion)
      } catch (error) {
        this.log(
          'error',
          `Error making completion call - mode: ${this.mode} | Client base URL: ${this.client.baseURL} | with params:`,
          resolvedParams,
          `raw error`,
          error
        )
        throw new RetryableError(
          error instanceof Error ? error.message : 'Error making completion call',
          error
        )
      }
      const responseParser =
        MODE_TO_RESPONSE_PARSER?.[this.mode as unknown as keyof typeof MODE_TO_RESPONSE_PARSER] ??
        OAIResponseParser
      const parsedCompletion = responseParser(completion as OpenAI.Chat.Completions.ChatCompletion)

      try {
        const responseJson = parsedCompletion.json ?? parsedCompletion
        const data = JSON.parse(responseJson) as z.infer<T> & {
          _meta?: CompletionMeta
          thinking?: string
        }
        return {
          data: [data],
          _meta: {
            usage: completion?.usage ?? undefined,
            thinking: parsedCompletion?.thinking ?? undefined,
          },
        }
      } catch (error) {
        this.log(
          'error',
          'failed to parse completion',
          parsedCompletion,
          this.mode,
          'attempt: ',
          attempts,
          'max attempts: ',
          max_retries
        )
        throw new RetryableError('Failed to parse completion', error)
      }
    }

    const makeCompletionCallWithRetries = async () => {
      try {
        const data = await makeCompletionCall()
        const validation = await response_model.schema.safeParseAsync(data.data[0] as unknown)
        this.log('debug', response_model.name, 'Completion validation: ', validation)
        if (!validation.success) {
          if ('error' in validation && validation.error instanceof ZodError) {
            lastMessage = {
              role: 'assistant',
              content: JSON.stringify(data),
            }
            try {
              if (
                validation.error &&
                Array.isArray((validation.error as { issues?: unknown[] }).issues) &&
                (validation.error as { issues?: unknown[] }).issues!.length > 0
              ) {
                try {
                  const errorForFormatting = validation.error as unknown as Parameters<
                    typeof fromZodError
                  >[0]
                  validationIssues =
                    fromZodError(errorForFormatting)?.message ?? 'Validation failed with issues'
                } catch {
                  const firstMsg = validation.error.issues?.[0]?.message
                  validationIssues = firstMsg ?? 'Validation failed with issues'
                }
              } else {
                validationIssues = 'Validation failed: error structure missing or invalid'
                this.log('debug', 'Validation error structure:', JSON.stringify(validation.error))
              }
            } catch (fromZodErrorException) {
              validationIssues = `Validation failed: ${
                validation.error?.issues?.[0]?.message ?? 'unknown validation error'
              }`
              this.log('debug', 'fromZodError failed:', fromZodErrorException)
              this.log('debug', 'Original validation error:', JSON.stringify(validation.error))
            }
            // Propagate the original ZodError without introducing a new local error.
            throw new ValidationError(validation.error.issues, validation.error)
          } else {
            // Propagate non-Zod validation failure by rethrowing as-is to avoid masking upstream errors.
            // Use the correct caught variable from this catch scope.
            throw new NonRetryableError('Validation failed', validation.error)
          }
        }
        return { data: [validation.data], _meta: data?._meta ?? {} }
      } catch (error) {
        if (!this.retryAllErrors && !(error instanceof ValidationError)) {
          throw error
        }
        if (attempts < max_retries) {
          this.log(
            'debug',
            `response model: ${response_model.name} - Retrying, attempt: `,
            attempts
          )
          this.log(
            'warn',
            `response model: ${response_model.name} - Validation issues: `,
            validationIssues,
            ' - Attempt: ',
            attempts,
            ' - Max attempts: ',
            max_retries
          )
          attempts++
          return await makeCompletionCallWithRetries()
        } else {
          this.log(
            'debug',
            `response model: ${response_model.name} - Max attempts reached: ${attempts}`
          )
          this.log(
            'error',
            `response model: ${response_model.name} - Validation issues: `,
            validationIssues
          )
          throw error
        }
      }
    }
    return makeCompletionCallWithRetries()
  }

  /**
   * Executes a streaming chat completion, yielding partial results as they arrive.
   * Supports schema validation and collects usage metadata during the stream.
   *
   * Args:
   *   params (ChatCompletionCreateParamsWithModel): Parameters for the chat completion, including the response model.
   *   requestOptions (optional): Additional request options for the client.
   *
   * Returns:
   *   AsyncGenerator<{ data: Partial<z.output<T>>[]; _meta: CompletionMeta }, void, unknown>: An async generator yielding partial completion data and metadata.
   */
  private async *chatCompletionStream<T extends z.ZodType>(
    { max_retries, response_model, ...params }: ChatCompletionCreateParamsWithModel<T>,
    requestOptions?: ClientTypeChatCompletionRequestOptions<C>
  ): AsyncGenerator<{ data: Partial<z.output<T>>[]; _meta: CompletionMeta }, void, unknown> {
    if (max_retries) {
      this.log('warn', 'max_retries is not supported for streaming completions')
    }
    const paramsTransformer = (
      PROVIDER_PARAMS_TRANSFORMERS?.[this.provider] as Record<string, unknown> | undefined
    )?.[this.mode as unknown as string] as ((p: unknown) => unknown) | undefined

    let completionParams = withResponseModel({
      params: {
        ...params,
        stream: true,
      } as OpenAI.ChatCompletionCreateParams,
      response_model,
      mode: this.mode,
    })

    if (typeof paramsTransformer === 'function') {
      completionParams = paramsTransformer(completionParams as unknown) as typeof completionParams
    }

    const streamClient = new ZodStream({
      debug: this.debug ?? false,
    })

    const checkForUsage = async (
      reader: Stream<OpenAI.ChatCompletionChunk> | AsyncIterable<OpenAI.ChatCompletionChunk>
    ) => {
      for await (const chunk of reader) {
        if ('usage' in chunk) {
          streamUsage = chunk.usage as CompletionMeta['usage']
        }
      }
    }
    let streamUsage: CompletionMeta['usage'] | undefined
    const structuredStream = await streamClient.create({
      completionPromise: async () => {
        if (this.client.chat?.completions?.create) {
          const completion = await this.client.chat.completions.create(
            {
              ...completionParams,
              stream: true,
            },
            requestOptions
          )
          this.log('debug', 'raw stream completion response: ', completion)
          if (
            this.provider === 'OAI' &&
            completionParams?.stream &&
            'stream_options' in completionParams &&
            completion instanceof Stream
          ) {
            const [completion1, completion2] = completion.tee()
            checkForUsage(completion1)
            return OAIStream({
              res: completion2,
            })
          }
          if (
            this.provider !== 'OAI' &&
            completionParams?.stream &&
            (completion as unknown as { [Symbol.asyncIterator]?: unknown })?.[Symbol.asyncIterator]
          ) {
            const [completion1, completion2] = await iterableTee(
              completion as AsyncIterable<OpenAI.ChatCompletionChunk>,
              2
            )
            checkForUsage(completion1)
            return OAIStream({
              res: completion2,
            })
          }
          return OAIStream({
            res: completion as unknown as AsyncIterable<OpenAI.ChatCompletionChunk>,
          })
        } else {
          throw new UnsupportedClientError('Unsupported client type')
        }
      },
      response_model: { schema: response_model.schema },
    })
    for await (const chunk of structuredStream) {
      yield {
        data: chunk.data,
        _meta: {
          usage: streamUsage ?? undefined,
          ...(chunk?._meta ?? {}),
        },
      }
    }
  }

  /**
   * Determines if the provided parameters include a response model for schema validation.
   * Used to distinguish between typed and untyped completion requests.
   *
   * Args:
   *   params (ChatCompletionCreateParamsWithModel): The parameters to check.
   *
   * Returns:
   *   boolean: True if the parameters include a response model, false otherwise.
   */
  private isChatCompletionCreateParamsWithModel<T extends z.ZodType>(
    params: ChatCompletionCreateParamsWithModel<T>
  ): params is ChatCompletionCreateParamsWithModel<T> {
    return 'response_model' in params
  }

  /**
   * Checks if the given parameters specify a standard streaming completion.
   * Returns true if the 'stream' property is set to true.
   *
   * Args:
   *   params (OpenAI.ChatCompletionCreateParams): The parameters to check.
   *
   * Returns:
   *   boolean: True if streaming is enabled, false otherwise.
   */
  private isStandardStream(
    params: OpenAI.ChatCompletionCreateParams
  ): params is OpenAI.ChatCompletionCreateParams {
    return 'stream' in params && params.stream === true
  }

  /**
   * Provides a unified interface for creating chat completions, supporting both standard and streaming modes.
   * Automatically selects the appropriate completion method based on the provided parameters.
   *
   * Args:
   *   params: The parameters for the chat completion, with or without a response model.
   *   requestOptions (optional): Additional request options for the client.
   *
   * Returns:
   *   Promise or AsyncGenerator: The completion result, type depends on the parameters.
   *
   * Raises:
   *   UnsupportedClientError: If the client does not support completions.
   */
  public chat = {
    completions: {
      create: async <
        T extends z.ZodType,
        P extends T extends z.ZodType ? ChatCompletionCreateParamsWithModel<T>
        : ClientTypeChatCompletionParams<OpenAILikeClient<C>> & { response_model: never },
      >(
        params: P,
        requestOptions?: ClientTypeChatCompletionRequestOptions<C>
      ): Promise<ReturnTypeBasedOnParams<typeof this.client, P>> => {
        if (this.isChatCompletionCreateParamsWithModel(params)) {
          if (params.stream) {
            return this.chatCompletionStream(params, requestOptions) as ReturnTypeBasedOnParams<
              typeof this.client,
              P & { stream: true }
            >
          } else {
            return this.chatCompletionStandard(params, requestOptions) as ReturnTypeBasedOnParams<
              typeof this.client,
              P
            >
          }
        } else if (this.client.chat?.completions?.create) {
          const result =
            this.isStandardStream(params) ?
              await this.client.chat.completions.create(params, requestOptions)
            : await this.client.chat.completions.create(params, requestOptions)
          return result as unknown as ReturnTypeBasedOnParams<OpenAILikeClient<C>, P>
        } else {
          throw new UnsupportedClientError('Completion method is undefined')
        }
      },
    },
  }
}

export type InstructorClient<C> = Instructor<C> & OpenAILikeClient<C>

/**
 * Creates an instance of the `Instructor` class.
 * @returns {InstructorClient} The extended OpenAI client.
 * @example import createInstructor from "@instructor-ai/instructor"
import OpenAI from "openai"

const OAI = new OpenAi({})

const client = createInstructor({
client: OAI,
mode: "TOOLS",
})
 * @param args
 * @returns
 */
export default function createInstructor<C>(args: InstructorConfig<C>): InstructorClient<C> {
  const instructor = new Instructor<C>(args)
  const instructorWithProxy = new Proxy(instructor, {
    get: (target, prop, receiver) => {
      if (prop in target) {
        return Reflect.get(target, prop, receiver)
      }
      return Reflect.get(target.client, prop, receiver)
    },
  })
  return instructorWithProxy as InstructorClient<C>
}

function isGenericClient(client: unknown): client is GenericClient {
  return (
    typeof client === 'object' &&
    client !== null &&
    'chat' in client &&
    typeof client.chat === 'object' &&
    client.chat !== null &&
    'completions' in client.chat &&
    typeof client.chat.completions === 'object' &&
    client.chat.completions !== null &&
    'create' in client.chat.completions &&
    typeof client.chat.completions.create === 'function'
  )
}
