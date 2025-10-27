import { setDeep, type Indexable } from './path.ts'
import { z } from 'zod'
import JSONParser from './json-parser.ts'
import { ParsedTokenInfo, StackElement, TokenParserMode, TokenParserState } from '@/stream'
import { charset } from './utf-8.ts'

type SchemaType = z.ZodType
type TypeDefaults = {
  string?: string | null | undefined
  number?: number | null | undefined
  boolean?: boolean | null | undefined
}
type NestedPrimitive = string | number | boolean | null
type NestedValue = NestedPrimitive | NestedObject | NestedValue[]
type NestedObject = { [key: string]: NestedValue } & { [key: number]: NestedValue }
type OnKeyCompleteCallbackParams = {
  activePath: (string | number | undefined)[]
  completedPaths: (string | number | undefined)[][]
}
type OnKeyCompleteCallback = (data: OnKeyCompleteCallbackParams) => void | undefined

type AutoJSONMode = 'off' | 'object-or-array'
type SnapshotMode = 'object' | 'string'

/**
 * SchemaStream builds a progressively populated "stub" object for a JSON stream
 * based on a provided Zod schema. This allows consumers to read a safe partial
 * structure before the upstream JSON has fully completed.
 *
 * All schema introspection relies exclusively on public Zod APIs compatible
 * with both Zod v3 and v4. No internal properties (e.g. `_def`) are used.
 */
export class SchemaStream {
  private schemaInstance: NestedObject
  private activePath: (string | number | undefined)[] = []
  private completedPaths: (string | number | undefined)[][] = []
  private readonly onKeyComplete?: OnKeyCompleteCallback
  private readonly autoJSONMode: AutoJSONMode
  private readonly maxUnstringifyDepth: number
  private readonly snapshotMode: SnapshotMode

  constructor(
    schema: SchemaType,
    opts: {
      defaultData?: NestedObject
      typeDefaults?: TypeDefaults
      onKeyComplete?: OnKeyCompleteCallback
      autoJSONMode?: AutoJSONMode
      maxUnstringifyDepth?: number
      snapshotMode?: SnapshotMode
    } = {}
  ) {
    const {
      defaultData,
      onKeyComplete,
      typeDefaults,
      autoJSONMode = 'object-or-array',
      maxUnstringifyDepth = 2,
      snapshotMode = 'object',
    } = opts
    this.schemaInstance = this.createBlankObject(schema, defaultData, typeDefaults)
    this.onKeyComplete = onKeyComplete
    this.autoJSONMode = autoJSONMode
    this.maxUnstringifyDepth = maxUnstringifyDepth
    this.snapshotMode = snapshotMode
  }

  /**
   * Attempt to extract a default value for a schema using **only public APIs**.
   *
   * Strategy:
   * 1. `safeParse(undefined)` – captures `.default()`, `.catch()`, and Zod v4
   *    short‑circuit behaviour without introspecting internals.
   * 2. Structural defaults for primitives/collections.
   * 3. Recursively unwrap optional/nullable/effects schemas via `unwrap()`.
   */
  private getDefaultValue(schema: SchemaType, typeDefaults?: TypeDefaults): unknown {
    /** Try parsing undefined to trigger defaults/catches. */
    try {
      const parsed = schema.safeParse(undefined)
      if (parsed.success && parsed.data !== undefined) {
        return parsed.data as unknown
      }
    } catch {
      /** ignore parse errors; fall through to structural defaults */
    }
    /** Structural defaults based on public instanceof checks. */
    if (schema instanceof z.ZodString) {
      return Object.prototype.hasOwnProperty.call(typeDefaults ?? {}, 'string') ?
          typeDefaults?.string
        : null
    }
    if (schema instanceof z.ZodNumber) {
      return Object.prototype.hasOwnProperty.call(typeDefaults ?? {}, 'number') ?
          typeDefaults?.number
        : null
    }
    if (schema instanceof z.ZodBoolean) {
      return Object.prototype.hasOwnProperty.call(typeDefaults ?? {}, 'boolean') ?
          typeDefaults?.boolean
        : null
    }
    if (schema instanceof z.ZodArray) {
      return []
    }
    if (schema instanceof z.ZodObject) {
      return this.createBlankObject(schema, undefined, typeDefaults)
    }
    if (schema instanceof z.ZodRecord) {
      /** Empty object for records; keys appear only as stream provides them. */
      return {}
    }
    if (
      schema instanceof z.ZodOptional ||
      schema instanceof z.ZodNullable ||
      /**
       /* ZodEffects (v3 + v4); public API exposes unwrap()
        * We intentionally check existence of unwrap to avoid instanceof mismatch across versions.
        */
      ('unwrap' in schema &&
        typeof (schema as unknown as { unwrap: () => unknown }).unwrap === 'function')
    ) {
      try {
        /** unwrap() exists on Optional/Nullable/Effects in both versions. */
        const unwrapped = (schema as unknown as { unwrap: () => SchemaType }).unwrap()
        return this.getDefaultValue(unwrapped as SchemaType, typeDefaults)
      } catch {
        /** Fallback for schemas that cannot be unwrapped or throw */
        return null
      }
    }
    /** Enums, native enums, unions etc. — no safe public way to pick one deterministically.*/
    return null
  }

  /**
   * Given a Zod schema, creates a blank object with default values for each property.
   *
   * @param schema - The Zod schema to use for creating the blank object.
   * @param defaultData - The default data to use for any properties
   * that are not explicitly set in the schema.
   * @param typeDefaults - The type defaults to use for any properties
   * that do not have an explicit default value.
   * @returns The blank object with default values for each property.
   */
  private createBlankObject(
    schema: SchemaType,
    defaultData?: NestedObject,
    typeDefaults?: TypeDefaults
  ): NestedObject {
    if (schema instanceof z.ZodObject) {
      const obj: NestedObject = {}
      const { shape } = schema
      for (const key in shape) {
        obj[key] =
          defaultData && Object.prototype.hasOwnProperty.call(defaultData, key) ?
            (defaultData[key as keyof NestedObject] as NestedValue)
          : (this.getDefaultValue(shape[key] as SchemaType, typeDefaults) as NestedValue)
      }
      return obj
    }
    /** Non-object root schema: wrap structural default (if object-like) or fallback to {} */
    const defaultValue = this.getDefaultValue(schema, typeDefaults)
    if (defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
      return defaultValue as NestedObject
    }
    return {}
  }

  /**
   * Returns the full path to the current value in the JSON structure as an array of keys.
   * This is used to track the position within the nested object being parsed.
   *
   * Args:
   *   stack: The stack of parent elements leading to the current value.
   *   key: The key or index of the current value.
   * Returns:
   *   An array representing the path to the current value in the object.
   */
  private getPathFromStack(
    stack: StackElement[] = [],
    key: string | number | undefined
  ): (string | number)[] {
    /** Build path without intermediate array copies or shift */
    const stackLen = stack.length
    const pathLen = stackLen > 0 ? stackLen - 1 : 0
    const out: (string | number)[] = new Array(pathLen + 1)
    for (let i = 1; i < stackLen; i++) {
      out[i - 1] = stack[i].key as string | number
    }
    out[pathLen] = key as string | number
    return out
  }

  /**
   * Handle a single parsed token from the tokenizer.
   *
   * This function is called by the tokenizer for each parsed token.
   * It updates the `schemaInstance` with the new value and emits events
   * for key completion.
   *
   * Args:
   *   {
   *     parser: {
   *       state: TokenParserState
   *       key: string | number | undefined
   *       mode: TokenParserMode | undefined
   *       stack: StackElement[]
   *     }
   *     tokenizer: ParsedTokenInfo
   *   }
   * Returns:
   *   void
   */
  private handleToken({
    parser: { key, stack },
    tokenizer: { value, partial },
  }: {
    parser: {
      state: TokenParserState
      key: string | number | undefined
      mode: TokenParserMode | undefined
      stack: StackElement[]
    }
    tokenizer: ParsedTokenInfo
  }): void {
    const nextPath = this.getPathFromStack(stack, key)
    const pathChanged =
      this.activePath.length === 0 ||
      !this.arePathsEqual(this.activePath as (string | number)[], nextPath)
    if (pathChanged) {
      this.activePath = nextPath
    }
    if (!partial) {
      this.completedPaths.push(nextPath)
    }
    if ((pathChanged || !partial) && this.onKeyComplete) {
      this.onKeyComplete({
        activePath: this.activePath,
        completedPaths: this.completedPaths,
      })
    }
    let nextValue: ParsedTokenInfo['value'] | NestedValue = value
    if (!partial && typeof value === 'string' && this.autoJSONMode !== 'off') {
      const unwrapped = this.unstringifyIfJSON(value)
      nextValue = unwrapped
    }
    setDeep(this.schemaInstance as Indexable, nextPath, nextValue)
  }
  /** Compare paths by value to avoid spurious updates on identical paths */
  private arePathsEqual(a: (string | number)[], b: (string | number)[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  private unstringifyIfJSON(value: string): NestedValue | string {
    let remainingDepth = this.maxUnstringifyDepth
    let current: unknown = value
    while (remainingDepth > 0 && typeof current === 'string') {
      const trimmed = current.trim()
      if (trimmed.length < 2) {
        break
      }
      const first = trimmed.charCodeAt(0)
      const last = trimmed.charCodeAt(trimmed.length - 1)
      const couldBeObject =
        first === charset.LEFT_CURLY_BRACKET && last === charset.RIGHT_CURLY_BRACKET
      const couldBeArray =
        first === charset.LEFT_SQUARE_BRACKET && last === charset.RIGHT_SQUARE_BRACKET
      let shouldAttemptParse = couldBeObject || couldBeArray
      if (
        !shouldAttemptParse &&
        first === charset.QUOTATION_MARK &&
        last === charset.QUOTATION_MARK
      ) {
        const inner = trimmed.slice(1, -1).trim()
        if (inner.length >= 2) {
          const innerFirst = inner.charCodeAt(0)
          const innerLast = inner.charCodeAt(inner.length - 1)
          const innerLooksObject =
            innerFirst === charset.LEFT_CURLY_BRACKET && innerLast === charset.RIGHT_CURLY_BRACKET
          const innerLooksArray =
            innerFirst === charset.LEFT_SQUARE_BRACKET && innerLast === charset.RIGHT_SQUARE_BRACKET
          if (innerLooksObject || innerLooksArray) {
            shouldAttemptParse = true
          }
        }
      }
      if (!shouldAttemptParse) {
        break
      }
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed)) {
          return parsed as NestedValue
        }
        if (parsed !== null && typeof parsed === 'object') {
          return parsed as NestedValue
        }
        if (typeof parsed === 'string') {
          current = parsed
          remainingDepth -= 1
          continue
        }
        return value
      } catch {
        return value
      }
    }
    return typeof current === 'string' ? current : value
  }

  /**
   * Get a "stub" object populated with default values for all
   * properties in the schema, using the provided default data
   * and type defaults if available.
   *
   * @param schema - The Zod schema to use for creating the stub.
   * @param defaultData - The default data to use for any properties
   * that are not explicitly set in the schema.
   * @param typeDefaults - The type defaults to use for any properties
   * that do not have an explicit default value.
   * @returns The stub object with all properties populated.
   */
  public getSchemaStub<S extends SchemaType>(
    schema: S,
    defaultData?: NestedObject,
    typeDefaults?: TypeDefaults
  ): z.infer<S> {
    return this.createBlankObject(schema, defaultData, typeDefaults) as z.infer<S>
  }

  /**
   * Parses a stream of JSON data and applies the default values
   * and type defaults to the schema instance.
   *
   * @param opts - Options for the JSON parser.
   * @param opts.stringBufferSize - The size of the internal string buffer.
   * @param opts.handleUnescapedNewLines - Whether to handle unescaped
   * newlines in the JSON data.
   * @returns A TransformStream that emits a JSON string for each
   * chunk of JSON data received, with the default values and type
   * defaults applied to the schema instance.
   */
  public parse(
    opts: {
      stringBufferSize?: number
      handleUnescapedNewLines?: boolean
    } = { stringBufferSize: 0, handleUnescapedNewLines: true }
  ): TransformStream<Uint8Array, unknown> {
    let parser = new JSONParser({
      stringBufferSize: opts.stringBufferSize ?? 0,
      handleUnescapedNewLines: opts.handleUnescapedNewLines ?? true,
      strictRootObject: true,
    })
    parser.onToken = this.handleToken.bind(this)
    parser.onValue = () => undefined
    parser.onError = (err: Error) => {
      console.warn('SchemaStream parser warning (chunk skipped):', err?.message ?? err)
    }
    const textEncoder = this.snapshotMode === 'string' ? new TextEncoder() : undefined
    return new TransformStream<Uint8Array, unknown>({
      transform: async (chunk, controller): Promise<void> => {
        try {
          parser.write(chunk)
          if (this.snapshotMode === 'object') {
            controller.enqueue(this.schemaInstance)
          } else {
            controller.enqueue(textEncoder!.encode(JSON.stringify(this.schemaInstance)))
          }
        } catch (err) {
          if (typeof parser.onError === 'function') {
            parser.onError(err as Error)
          }
          /** Soft reset parser on any error; drop this chunk */
          parser = new JSONParser({
            stringBufferSize: opts.stringBufferSize ?? 0,
            handleUnescapedNewLines: opts.handleUnescapedNewLines ?? true,
            strictRootObject: true,
          })
          parser.onToken = this.handleToken.bind(this)
          parser.onValue = () => undefined
          parser.onError = (e: Error) =>
            console.warn('SchemaStream parser warning (after reset):', e?.message ?? e)
        }
      },
      flush: () => {
        if (this.onKeyComplete) {
          this.onKeyComplete({
            completedPaths: this.completedPaths,
            activePath: [],
          })
        }
        this.activePath = []
      },
    })
  }
}
