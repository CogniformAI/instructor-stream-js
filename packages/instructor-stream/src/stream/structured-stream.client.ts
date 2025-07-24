import { readableStreamToAsyncGenerator } from './oai/stream.ts'
import {
  ActivePath,
  ClientConfig,
  CompletedPaths,
  CompletionMeta,
  LogLevel,
  ZodStreamCompletionParams,
} from '@/types'
import { z } from 'zod'
import { SchemaStream } from '@/utils/streaming-json-parser.ts'

export default class ZodStream {
  readonly debug: boolean = false

  constructor({ debug = false }: ClientConfig = {}) {
    this.debug = debug
  }
  // TODO: Determine if this is the same logger as the one in instructor
  // Only keep one if so.
  private log<T extends unknown[]>(level: LogLevel, ...args: T) {
    if (!this.debug && level === 'debug') {
      return
    }
    const timestamp = new Date().toISOString()
    switch (level) {
      case 'debug':
        console.debug(`[ZodStream-CLIENT:DEBUG] ${timestamp}:`, ...args)
        break
      case 'info':
        console.info(`[ZodStream-CLIENT:INFO] ${timestamp}:`, ...args)
        break
      case 'warn':
        console.warn(`[ZodStream-CLIENT:WARN] ${timestamp}:`, ...args)
        break
      case 'error':
        console.error(`[ZodStream-CLIENT:ERROR] ${timestamp}:`, ...args)
        break
    }
  }

  private async chatCompletionStream<T extends z.ZodAny>({
    completionPromise,
    data,
    response_model,
  }: ZodStreamCompletionParams<T>): Promise<
    AsyncGenerator<Partial<z.infer<T>> & { _meta: CompletionMeta }, void, unknown>
  > {
    let _activePath: ActivePath = []
    let _completedPaths: CompletedPaths = []

    this.log('debug', 'Starting completion stream')

    const streamParser = new SchemaStream(response_model.schema, {
      onKeyComplete: ({
        activePath,
        completedPaths,
      }: {
        activePath: ActivePath
        completedPaths: CompletedPaths
      }) => {
        this.log('debug', 'Key complete', activePath, completedPaths)
        _activePath = activePath
        _completedPaths = completedPaths
      },
      typeDefaults: {
        string: null,
        number: null,
        boolean: null,
      },
    })

    try {
      const parser = streamParser.parse({
        handleUnescapedNewLines: true,
      })

      const textEncoder = new TextEncoder()
      const textDecoder = new TextDecoder()

      const validationStream = new TransformStream({
        // TODO: Is this being used anywhere else?
        transform: async (chunk, controller): Promise<void> => {
          try {
            const parsedChunk = JSON.parse(textDecoder.decode(chunk))
            const validation = await response_model.schema.safeParseAsync(parsedChunk)

            this.log('debug', 'Validation result', validation)
            // TODO: Make this match the new data shape of the stream
            // Make sure that this gets updated downstream as well
            controller.enqueue(
              textEncoder.encode(
                JSON.stringify({
                  ...parsedChunk,
                  _meta: {
                    _isValid: validation.success,
                    _activePath,
                    _completedPaths,
                  },
                })
              )
            )
          } catch (e) {
            this.log('error', 'Error in the partial stream validation stream', e, chunk)
            controller.error(e)
          }
        },
        // TODO: Determine if this is even being called
        flush() {},
      })

      const stream = await completionPromise(data)

      if (!stream) {
        this.log('error', 'Completion call returned no data')
        // TODO: Clean up exception thrown and caught locally
        throw new Error(stream)
      }

      stream.pipeThrough(parser)
      parser.readable.pipeThrough(validationStream)

      return readableStreamToAsyncGenerator(validationStream.readable) as AsyncGenerator<
        Partial<z.infer<T>> & { _meta: CompletionMeta },
        void,
        unknown
      >
    } catch (error) {
      this.log('error', 'Error making completion call')
      throw error
    }
  }
  // TODO: Determine if this is being used anywhere else if not remove
  public getSchemaStub({
    schema,
    defaultData = {},
  }: {
    schema: z.ZodAny
    defaultData?: Partial<z.infer<typeof schema>>
  }): Partial<z.infer<typeof schema>> {
    const streamParser = new SchemaStream(schema, {
      defaultData,
      typeDefaults: {
        string: null,
        number: null,
        boolean: null,
      },
    })

    return streamParser.getSchemaStub(schema, defaultData)
  }

  public async create<P extends ZodStreamCompletionParams<z.ZodAny>>(
    params: P
  ): Promise<
    AsyncGenerator<
      Partial<z.infer<P['response_model']['schema']>> & { _meta: CompletionMeta },
      void,
      unknown
    >
  > {
    return this.chatCompletionStream(params)
  }
}
