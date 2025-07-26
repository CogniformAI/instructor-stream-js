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

const MAX_RETRIES_DEFAULT = 0

class Instructor<C> {
  readonly client: OpenAILikeClient<C>
  readonly mode: Mode
  readonly provider: Provider
  readonly debug: boolean = false
  readonly retryAllErrors: boolean = false
  readonly logger?: <T extends unknown[]>(level: LogLevel, ...args: T) => void

  /**
   * Creates an instance of the `Instructor` class.
   * @param {OpenAILikeClient} client - An OpenAI-like client.
   * @param mode
   * @param debug
   * @param logger
   * @param retryAllErrors
   */
  constructor({
    client,
    mode,
    debug = false,
    logger = undefined,
    retryAllErrors = false,
  }: InstructorConfig<C>) {
    if (!isGenericClient(client) && !(client instanceof OpenAI)) {
      throw new Error('Client does not match the required structure')
    }
    if (client instanceof OpenAI) {
      this.client = client as OpenAI
    } else {
      this.client = client as C & GenericClient
    }

    // this.client = client
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

  private validateOptions() {
    const isModeSupported = PROVIDER_SUPPORTED_MODES[this.provider].includes(this.mode)
    if (this.provider === PROVIDERS.OTHER) {
      this.log('debug', 'Unknown provider - cant validate options.')
    }
    if (!isModeSupported) {
      this.log('warn', `Mode ${this.mode} may not be supported by provider ${this.provider}`)
    }
  }

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
    //@ts-expect-error - This will get simplified and fixed later
    const paramsTransformer = PROVIDER_PARAMS_TRANSFORMERS?.[this.provider]?.[this.mode]
    let completionParams = withResponseModel({
      params: {
        ...params,
        stream: params.stream ?? false,
      } as OpenAI.ChatCompletionCreateParams,
      mode: this.mode,
      response_model,
    })
    if (!!paramsTransformer) {
      completionParams = paramsTransformer(completionParams)
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
          // TODO: Clean up exception thrown and caught locally
          // If there's an error it should be thrown from somewhere else and not here
          // it will already get caught below no need to throw it again
          throw new Error('Unsupported client type -- no completion method found.')
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
        throw error
      }
      // @ts-expect-error - Will fix these types later
      const responseParser = MODE_TO_RESPONSE_PARSER?.[this.mode] ?? OAIResponseParser
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
        throw error
      }
    }

    const makeCompletionCallWithRetries = async () => {
      try {
        const data = await makeCompletionCall()
        const validation = await response_model.schema.safeParseAsync(data)
        this.log('debug', response_model.name, 'Completion validation: ', validation)
        if (!validation.success) {
          if ('error' in validation) {
            lastMessage = {
              role: 'assistant',
              content: JSON.stringify(data),
            }
            // @ts-expect-error - This will get simplified and fixed later
            validationIssues = fromZodError(validation.error)?.message ?? ''
            // TODO: Clean up exception thrown and caught locally
            throw validation.error
          } else {
            // TODO: Clean up exception thrown and caught locally
            throw new Error('Validation failed.')
          }
        }
        return { data: [validation.data], _meta: data?._meta ?? {} }
      } catch (error) {
        if (!this.retryAllErrors && !(error instanceof ZodError)) {
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

  private async *chatCompletionStream<T extends z.ZodType>(
    { max_retries, response_model, ...params }: ChatCompletionCreateParamsWithModel<T>,
    requestOptions?: ClientTypeChatCompletionRequestOptions<C>
  ): AsyncGenerator<{ data: Partial<z.output<T>>[]; _meta: CompletionMeta }, void, unknown> {
    if (max_retries) {
      this.log('warn', 'max_retries is not supported for streaming completions')
    }
    //@ts-expect-error - This will get simplified and fixed later
    const paramsTransformer = PROVIDER_PARAMS_TRANSFORMERS?.[this.provider]?.[this.mode]

    let completionParams = withResponseModel({
      params: {
        ...params,
        stream: true,
      } as OpenAI.ChatCompletionCreateParams,
      response_model,
      mode: this.mode,
    })

    if (paramsTransformer) {
      completionParams = paramsTransformer(completionParams)
    }

    const streamClient = new ZodStream({
      debug: this.debug ?? false,
    })

    async function checkForUsage(
      reader: Stream<OpenAI.ChatCompletionChunk> | AsyncIterable<OpenAI.ChatCompletionChunk>
    ) {
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
            // TODO: Is there a reason this doesn't have an await?
            checkForUsage(completion1)
            return OAIStream({
              res: completion2,
            })
          }
          //check if async iterator
          if (
            this.provider !== 'OAI' &&
            completionParams?.stream &&
            //@ts-expect-error - This will get simplified and fixed later
            completion?.[Symbol.asyncIterator]
          ) {
            const [completion1, completion2] = await iterableTee(
              completion as AsyncIterable<OpenAI.ChatCompletionChunk>,
              2
            )
            // TODO: Is there a reason this doesn't have an await?
            checkForUsage(completion1)
            return OAIStream({
              res: completion2,
            })
          }
          return OAIStream({
            res: completion as unknown as AsyncIterable<OpenAI.ChatCompletionChunk>,
          })
        } else {
          throw new Error('Unsupported client type')
        }
      },
      response_model: { schema: response_model.schema },
    })
    for await (const chunk of structuredStream) {
      yield {
        //TODO: This is partially correct, will determine if completion data
        // should be a part of the _meta or it's own property
        data: chunk.data,
        _meta: {
          usage: streamUsage ?? undefined,
          ...(chunk?._meta ?? {}),
        },
      }
    }
  }

  private isChatCompletionCreateParamsWithModel<T extends z.ZodType>(
    params: ChatCompletionCreateParamsWithModel<T>
  ): params is ChatCompletionCreateParamsWithModel<T> {
    return 'response_model' in params
  }

  private isStandardStream(
    params: OpenAI.ChatCompletionCreateParams
  ): params is OpenAI.ChatCompletionCreateParams {
    return 'stream' in params && params.stream === true
  }

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
          throw new Error('Completion method is undefined')
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
import OpenAI from "openai

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
//eslint-disable-next-line @typescript-eslint/no-explicit-any
function isGenericClient(client: any): client is GenericClient {
  return (
    typeof client === 'object' &&
    client !== null &&
    'chat' in client &&
    typeof client.chat === 'object' &&
    'completions' in client.chat &&
    typeof client.chat.completions === 'object' &&
    'create' in client.chat.completions &&
    typeof client.chat.completions.create === 'function'
  )
}
