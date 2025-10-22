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
import {
  createFunctionStreamingAdapter,
  type StreamingProviderAdapter,
} from '@/adapters/streaming-provider-adapter.ts'

export default class ZodStream {
  readonly debug: boolean = false

  constructor({ debug = false }: ClientConfig = {}) {
    this.debug = debug
  }
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

  private async chatCompletionStream<T extends z.ZodType>({
    adapter,
    channelType = 'default',
    completionPromise,
    data,
    response_model,
    validationMode = 'none',
    signal,
  }: ZodStreamCompletionParams<T>): Promise<
    AsyncGenerator<{ data: Partial<z.infer<T>>[]; _meta: CompletionMeta }, void, unknown>
  > {
    let _activePath: ActivePath = []
    let _completedPaths: CompletedPaths = []
    let completedPathCount = 0
    let pendingOnCompleteValidation = false
    let lastSnapshot: Partial<z.infer<T>> | null = null
    let lastValidationResult = true
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
        _activePath = [...activePath]
        _completedPaths = completedPaths.map((path) => (Array.isArray(path) ? [...path] : []))
        if (completedPaths.length > completedPathCount) {
          pendingOnCompleteValidation = true
          completedPathCount = completedPaths.length
        }
      },
      typeDefaults: {
        string: null,
        number: null,
        boolean: null,
      },
      snapshotMode: 'object',
    })

    try {
      const resolvedAdapter: StreamingProviderAdapter<T> | undefined =
        adapter ??
        (completionPromise ?
          createFunctionStreamingAdapter(async ({ data: adapterData, signal: adapterSignal }) => {
            return completionPromise(adapterData, adapterSignal)
          })
        : undefined)

      if (!resolvedAdapter) {
        throw new Error('No streaming provider adapter or completionPromise was supplied.')
      }

      const providerResult = await resolvedAdapter.start({
        schema: response_model.schema,
        data,
        signal,
      })
      if (!providerResult?.stream) {
        this.log('error', 'Adapter returned no stream')
        throw new Error('Adapter returned no stream')
      }

      const baseMeta: CompletionMeta = providerResult.meta ?? {}
      const parser = streamParser.parse({
        handleUnescapedNewLines: true,
      })
      const parsedStream = providerResult.stream.pipeThrough(parser)
      const validationStream = new TransformStream<
        Partial<z.infer<T>>,
        { data: Partial<z.infer<T>>[]; _meta: CompletionMeta }
      >({
        transform: async (snapshot, controller): Promise<void> => {
          lastSnapshot = snapshot
          try {
            if (validationMode === 'on-complete' && pendingOnCompleteValidation) {
              const validation = await response_model.schema.safeParseAsync(snapshot)
              lastValidationResult = validation.success
              pendingOnCompleteValidation = false
              this.log('debug', 'Validation (on-complete) result', validation.success)
            } else if (validationMode === 'none') {
              lastValidationResult = true
            }
            const meta: CompletionMeta = {
              ...baseMeta,
              _isValid: validationMode === 'none' ? true : lastValidationResult,
              _activePath,
              _completedPaths,
              _type: channelType,
            }
            controller.enqueue({
              data: [snapshot],
              _meta: meta,
            })
          } catch (e) {
            this.log('error', 'Error validating snapshot', e)
            controller.error(e)
          }
        },
        flush: async (controller): Promise<void> => {
          if (!lastSnapshot) {
            return
          }
          if (validationMode === 'final') {
            try {
              const validation = await response_model.schema.safeParseAsync(lastSnapshot)
              lastValidationResult = validation.success
              this.log('debug', 'Validation (final) result', validation.success)
            } catch (error) {
              this.log('error', 'Error validating final snapshot', error)
              lastValidationResult = false
            }
            const meta: CompletionMeta = {
              ...baseMeta,
              _isValid: lastValidationResult,
              _activePath,
              _completedPaths,
              _type: channelType,
            }
            controller.enqueue({
              data: [lastSnapshot],
              _meta: meta,
            })
          }
        },
      })

      const validatedStream = parsedStream.pipeThrough(validationStream)
      return readableStreamToAsyncGenerator(validatedStream) as AsyncGenerator<
        { data: Partial<z.infer<T>>[]; _meta: CompletionMeta },
        void,
        unknown
      >
    } catch (error) {
      this.log('error', 'Error making completion call')
      throw error
    }
  }

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

  public async create<P extends ZodStreamCompletionParams<z.ZodType>>(
    params: P
  ): Promise<
    AsyncGenerator<
      { data: Partial<z.infer<P['response_model']['schema']>>[]; _meta: CompletionMeta },
      void,
      unknown
    >
  > {
    return this.chatCompletionStream(params)
  }
}
