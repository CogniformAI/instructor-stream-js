import { lensPath, set, view } from 'ramda'
import { z, ZodObject, ZodOptional, ZodRawShape, ZodTypeAny } from 'zod'

import JSONParser from './json-parser'
import { ParsedTokenInfo, StackElement, TokenParserMode, TokenParserState } from './token-parser'

type SchemaType<T extends ZodRawShape = ZodRawShape> = ZodObject<T> | ZodTypeAny
type TypeDefaults = {
  string?: string | null | undefined
  number?: number | null | undefined
  boolean?: boolean | null | undefined
}

type NestedValue = string | number | boolean | NestedObject | NestedValue[]
type NestedObject = { [key: string]: NestedValue } & { [key: number]: NestedValue }

type OnKeyCompleteCallbackParams = {
  activePath: (string | number | undefined)[]
  completedPaths: (string | number | undefined)[][]
}

type OnKeyCompleteCallback = (data: OnKeyCompleteCallbackParams) => void | undefined

/**
 * `SchemaStream` is a utility for parsing streams of json and
 * providing a safe-to-read-from stubbed version of the data before the stream
 * has fully completed.
 *
 * It uses Zod for schema validation and the Streamparser library for
 * parsing JSON from an input stream.
 *
 * @example
 * ```typescript
 * const schema = z.object({
 *   someString: z.string(),
 *   someNumber: z.number()
 * })
 *
 * const response = await getSomeStreamOfJson()
 * const parser = new SchemaStream(schema)
 * const streamParser = parser.parse()
 *
 * response.body?.pipeThrough(parser)
 *
 * const reader = streamParser.readable.getReader()
 *
 * const decoder = new TextDecoder()
 * let result = {}
 * while (!done) {
 *   const { value, done: doneReading } = await reader.read()
 *   done = doneReading
 *
 *   if (done) {
 *     console.log(result)
 *     break
 *   }
 *
 *   const chunkValue = decoder.decode(value)
 *   result = JSON.parse(chunkValue)
 * }
 * ```
 *
 * @public
 */

export class SchemaStream {
  private schemaInstance: NestedObject
  private activePath: (string | number | undefined)[] = []
  private completedPaths: (string | number | undefined)[][] = []
  private onKeyComplete?: OnKeyCompleteCallback

  /**
   * Constructs a new instance of the `SchemaStream` class.
   *
   * @param schema - The Zod schema to use for validation.
   */
  constructor(
    schema: SchemaType,
    opts: {
      defaultData?: NestedObject
      typeDefaults?: TypeDefaults
      onKeyComplete?: OnKeyCompleteCallback
    } = {}
  ) {
    const { defaultData, onKeyComplete, typeDefaults } = opts

    this.schemaInstance = this.createBlankObject(schema, defaultData, typeDefaults)
    this.onKeyComplete = onKeyComplete
  }

  // TODO: Update the deprecated Zod code to match the new Zod conventions.
  /**
   * Gets the default value for a given Zod type.
   *
   * Full set of first-party Zod types can be found here:
   * (https://github.com/colinhacks/zod/blob/master/src/types.ts#L4938C1-L4973C1)
   *
   * @param type - The Zod type.
   * @returns The default value for the type.
   */
  private getDefaultValue(type: ZodTypeAny, typeDefaults?: TypeDefaults): unknown {
    if (type?._def?.defaultValue) {
      return type._def.defaultValue()
    }

    switch (type._def.typeName) {
      case 'ZodDefault':
        return type._def.defaultValue()
      case 'ZodString':
        return typeDefaults?.hasOwnProperty('string') ? typeDefaults.string : null
      case 'ZodNumber':
        return typeDefaults?.hasOwnProperty('number') ? typeDefaults.number : null
      case 'ZodBoolean':
        return typeDefaults?.hasOwnProperty('boolean') ? typeDefaults.boolean : null
      case 'ZodArray':
        return []
      case 'ZodRecord':
        return {}
      case 'ZodObject':
        return this.createBlankObject(type as SchemaType)
      case 'ZodOptional':
        //eslint-disable-next-line
        return this.getDefaultValue((type as ZodOptional<any>).unwrap())
      case 'ZodEffects':
        return this.getDefaultValue(type._def.schema)
      case 'ZodNullable':
        return null
      case 'ZodEnum':
        return null
      case 'ZodNativeEnum':
        return null
      default:
        console.warn(`No explicit default value for type: ${type._def.typeName} - returning null.`)
        return null
    }
  }

  private createBlankObject<T extends ZodRawShape>(
    schema: SchemaType<T>,
    defaultData?: NestedObject,
    typeDefaults?: TypeDefaults
  ): NestedObject {
    // Handle ZodObject with shape
    if (schema instanceof ZodObject && 'shape' in schema) {
      const obj: NestedObject = {}

      for (const key in schema.shape) {
        const type = schema.shape[key]
        if (defaultData && defaultData?.[key as unknown as keyof NestedObject]) {
          obj[key] = defaultData?.[key as unknown as keyof NestedObject]
        } else {
          obj[key] = this.getDefaultValue(type, typeDefaults) as NestedValue
        }
      }

      return obj
    }

    // Handle other ZodTypeAny schemas - return default value
    const defaultValue = this.getDefaultValue(schema, typeDefaults)
    return typeof defaultValue === 'object' && defaultValue !== null ?
        (defaultValue as NestedObject)
      : {}
  }

  private getPathFromStack(
    stack: StackElement[] = [],
    key: string | number | undefined
  ): (string | number)[] {
    const valuePath = [...stack.map(({ key }) => key), key]
    valuePath.shift()

    // first item is undefined as root - we remove with shift to avoid the full filter
    // that's why we cast here
    return valuePath as (string | number)[]
  }

  private handleToken({
    parser: { key, stack },
    tokenizer: { token, value, partial },
  }: {
    parser: {
      state: TokenParserState
      key: string | number | undefined
      mode: TokenParserMode | undefined
      stack: StackElement[]
    }
    tokenizer: ParsedTokenInfo
  }): void {
    if (this.activePath !== this.getPathFromStack(stack, key) || this.activePath.length === 0) {
      this.activePath = this.getPathFromStack(stack, key)
      !partial && this.completedPaths.push(this.activePath)
      this.onKeyComplete &&
        this.onKeyComplete({
          activePath: this.activePath,
          completedPaths: this.completedPaths,
        })
    }

    try {
      const valuePath = this.getPathFromStack(stack, key)
      const lens = lensPath(valuePath)

      if (partial) {
        const currentValue = view(lens, value) ?? ''
        const updatedValue = `${currentValue}${value}`
        const updatedSchemaInstance = set(lens, updatedValue, this.schemaInstance)
        this.schemaInstance = updatedSchemaInstance
      } else {
        const updatedSchemaInstance = set(lens, value, this.schemaInstance)
        this.schemaInstance = updatedSchemaInstance
      }
    } catch (e) {
      console.error(`Error in the json parser onToken handler: token ${token} value ${value}`, e)
    }
  }

  public getSchemaStub<T extends ZodRawShape>(
    schema: SchemaType<T>,
    defaultData?: NestedObject
  ): z.infer<typeof schema> {
    return this.createBlankObject(schema, defaultData) as z.infer<typeof schema>
  }

  /**
   * Parses the JSON stream.
   *
   * @param {Object} opts - The options for parsing the JSON stream.
   * @returns A `TransformStream` that can be used to process the JSON data.
   */
  public parse(
    opts: {
      stringBufferSize?: number
      handleUnescapedNewLines?: boolean
    } = { stringBufferSize: 0, handleUnescapedNewLines: true }
  ) {
    const textEncoder = new TextEncoder()

    const parser = new JSONParser({
      stringBufferSize: opts.stringBufferSize ?? 0,
      handleUnescapedNewLines: opts.handleUnescapedNewLines ?? true,
    })

    parser.onToken = this.handleToken.bind(this)
    parser.onValue = () => void 0

    // TODO: This needs to updated to the new output data shape where we separate the
    // TODO: meta data from the json data that is being parsed.  To align better with
    // TODO: the more agentic models that can stream plain text and JSON data in the same
    // TODO: turn, we may also want to handle this as well as image data.
    const stream = new TransformStream({
      transform: async (chunk, controller): Promise<void> => {
        try {
          if (parser.isEnded) {
            controller.enqueue(textEncoder.encode(JSON.stringify(this.schemaInstance)))

            return
          } else {
            parser.write(chunk)
            controller.enqueue(textEncoder.encode(JSON.stringify(this.schemaInstance)))
          }
        } catch (e) {
          console.error(`Error in the json parser transform stream: parsing chunk`, e, chunk)
        }
      },
      flush: () => {
        this.onKeyComplete &&
          this.onKeyComplete({
            completedPaths: this.completedPaths,
            activePath: [],
          })

        this.activePath = []
      },
    })

    return stream
  }
}
