import { setDeep, type Indexable } from './path.ts'
import { z } from 'zod'
import JSONParser from './json-parser.ts'
import { ParsedTokenInfo, StackElement, TokenParserMode, TokenParserState } from './token-parser.ts'
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
type PathSegment = string | number | undefined
type OnKeyCompleteCallbackParams = {
  activePath: PathSegment[]
  completedPaths: PathSegment[][]
}
type OnKeyCompleteCallback = (data: OnKeyCompleteCallbackParams) => void

type AutoJSONMode = 'off' | 'object-or-array'
type SnapshotMode = 'object' | 'string'

type ParserContext = {
  readonly key: string
  readonly prefix: PathSegment[]
  parser: JSONParser | null
  activePath: PathSegment[]
  completedPaths: PathSegment[][]
  recentCompletions: PathSegment[][]
  structureDepth: number
  inString: boolean
  escaped: boolean
}

type ParserOptions = {
  stringBufferSize?: number
  handleUnescapedNewLines?: boolean
  stringEmitInterval?: number
}

export type IngestOutcome = {
  completions: PathSegment[][]
  closed: boolean
}

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
  private readonly onKeyComplete: OnKeyCompleteCallback | null
  private readonly autoJSONMode: AutoJSONMode
  private readonly maxUnstringifyDepth: number
  private readonly snapshotMode: SnapshotMode
  private readonly contexts = new Map<string, ParserContext>()
  private activePath: PathSegment[] = []
  private completedPaths: PathSegment[][] = []

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
    this.onKeyComplete = onKeyComplete ?? null
    this.autoJSONMode = autoJSONMode
    this.maxUnstringifyDepth = maxUnstringifyDepth
    this.snapshotMode = snapshotMode
    this.ensureContext([], SchemaStream.defaultParserOpts)
  }

  private static defaultParserOpts: Required<ParserOptions> = {
    stringBufferSize: 0,
    handleUnescapedNewLines: true,
    stringEmitInterval: 256,
  }

  private static contextKey(prefix: PathSegment[]): string {
    if (prefix.length === 0) {
      return '$root'
    }
    return prefix
      .map((segment) => {
        if (segment === undefined) return 'u'
        if (typeof segment === 'number') return `#${segment}`
        return encodeURIComponent(segment)
      })
      .join('.')
  }

  private ensureContext(prefix: PathSegment[], opts: ParserOptions): ParserContext {
    const key = SchemaStream.contextKey(prefix)
    const existing = this.contexts.get(key)
    if (existing) {
      return existing
    }
    const parserOpts = {
      stringBufferSize: opts.stringBufferSize ?? SchemaStream.defaultParserOpts.stringBufferSize,
      handleUnescapedNewLines:
        opts.handleUnescapedNewLines ?? SchemaStream.defaultParserOpts.handleUnescapedNewLines,
      stringEmitInterval:
        opts.stringEmitInterval ?? SchemaStream.defaultParserOpts.stringEmitInterval,
      strictRootObject: true,
    }
    const context: ParserContext = {
      key,
      prefix: [...prefix],
      activePath: [],
      completedPaths: [],
      recentCompletions: [],
      structureDepth: 0,
      inString: false,
      escaped: false,
      parser: null,
    }
    context.parser = new JSONParser(parserOpts)
    this.configureParser(context)
    this.contexts.set(key, context)
    return context
  }

  private configureParser(context: ParserContext): void {
    if (!context.parser) {
      return
    }
    context.parser.onToken = (info) => this.handleToken(context, info)
    context.parser.onValue = () => undefined
    context.parser.onError = () => undefined
    context.parser.onEnd = () => {
      context.activePath = []
    }
  }

  private disposeParser(context: ParserContext): void {
    if (!context.parser) {
      return
    }
    const noop = () => undefined
    context.parser.onToken = noop as never
    context.parser.onValue = noop
    context.parser.onError = noop
    context.parser.onEnd = noop
    context.parser = null
  }

  private resetContext(context: ParserContext, opts: ParserOptions): void {
    const parserOpts = {
      stringBufferSize: opts.stringBufferSize ?? SchemaStream.defaultParserOpts.stringBufferSize,
      handleUnescapedNewLines:
        opts.handleUnescapedNewLines ?? SchemaStream.defaultParserOpts.handleUnescapedNewLines,
      stringEmitInterval:
        opts.stringEmitInterval ?? SchemaStream.defaultParserOpts.stringEmitInterval,
      strictRootObject: true,
    }
    this.disposeParser(context)
    context.parser = new JSONParser(parserOpts)
    context.recentCompletions = []
    context.structureDepth = 0
    context.inString = false
    context.escaped = false
    this.configureParser(context)
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
  ): PathSegment[] {
    /** Build path without intermediate array copies or shift */
    const stackLen = stack.length
    const pathLen = stackLen > 0 ? stackLen - 1 : 0
    const out: PathSegment[] = new Array(pathLen + 1)
    for (let i = 1; i < stackLen; i++) {
      const element = stack[i]
      out[i - 1] = element?.key
    }
    out[pathLen] = key
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
  private handleToken(
    context: ParserContext,
    {
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
    }
  ): void {
    const relativePath = this.getPathFromStack(stack, key)
    const fullPath = context.prefix.length > 0 ? [...context.prefix, ...relativePath] : relativePath
    const pathChanged =
      context.activePath.length === 0 || !this.arePathsEqual(context.activePath, fullPath)
    if (pathChanged) {
      context.activePath = [...fullPath]
    }
    if (!partial) {
      const completedPath = [...fullPath]
      context.completedPaths.push(completedPath)
      context.recentCompletions.push(completedPath)
      this.completedPaths.push(completedPath)
    }
    if ((pathChanged || !partial) && this.onKeyComplete) {
      this.activePath = [...fullPath]
      this.onKeyComplete({
        activePath: [...this.activePath],
        completedPaths: this.completedPaths.map((path) => [...path]),
      })
    }
    let nextValue: ParsedTokenInfo['value'] | NestedValue = value
    if (!partial && typeof value === 'string' && this.autoJSONMode !== 'off') {
      const unwrapped = this.unstringifyIfJSON(value)
      nextValue = unwrapped
    }
    setDeep(this.schemaInstance as Indexable, fullPath, nextValue)
  }
  /** Compare paths by value to avoid spurious updates on identical paths */
  private arePathsEqual(a: PathSegment[], b: PathSegment[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  /**
   * Recursively attempts to parse a string value as JSON up to a maximum depth.
   *
   * This method handles cases where JSON has been stringified multiple times
   * (e.g., `"\"{\\"key\\":\\"value\\"}\""`) by repeatedly parsing until reaching
   * a non-string value or the maximum depth limit.
   *
   * @param value - The string value to unstringify
   * @returns The parsed nested value (object or array) if successful, or the original
   *          string if parsing fails or the value doesn't appear to be JSON
   *
   * @remarks
   * The method performs validation checks before attempting to parse:
   * - Checks if the string starts and ends with appropriate JSON delimiters (`{}`, `[]`, or `""`)
   * - For quoted strings, checks if the inner content looks like JSON
   * - Only attempts parsing when the string structure suggests it contains JSON
   * - Respects `maxUnstringifyDepth` to prevent excessive recursion
   *
   * If parsing succeeds but results in a primitive value other than a string,
   * the original value is returned instead.
   */
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
        if (Array.isArray(parsed) || (parsed !== null && typeof parsed === 'object')) {
          return parsed as NestedValue
        }
        if (typeof parsed === 'string') {
          current = parsed
          remainingDepth--
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
    opts: ParserOptions = SchemaStream.defaultParserOpts
  ): TransformStream<string | Uint8Array, unknown> {
    const context = this.ensureContext([], opts)
    const textEncoder = this.snapshotMode === 'string' ? new TextEncoder() : null
    return new TransformStream<string | Uint8Array, unknown>({
      transform: (chunk, controller) => {
        try {
          this.writeChunk(context, chunk, opts)
          if (this.snapshotMode === 'object') {
            controller.enqueue(this.schemaInstance)
          } else if (textEncoder) {
            controller.enqueue(textEncoder.encode(JSON.stringify(this.schemaInstance)))
          }
        } catch (err) {
          if (typeof context.parser?.onError === 'function') {
            context.parser.onError(err as Error)
          }
          this.resetContext(context, opts)
        }
      },
      flush: () => {
        if (this.onKeyComplete) {
          this.onKeyComplete({
            completedPaths: this.completedPaths.map((path) => [...path]),
            activePath: [],
          })
        }
        this.activePath = []
      },
    })
  }

  public ingest(
    prefix: PathSegment[],
    chunk: string | Uint8Array,
    opts: ParserOptions = SchemaStream.defaultParserOpts
  ): IngestOutcome {
    const context = this.ensureContext(prefix, opts)
    return this.writeChunk(context, chunk, opts)
  }

  public releaseContext(prefix: PathSegment[]): void {
    const key = SchemaStream.contextKey(prefix)
    const context = this.contexts.get(key)
    if (!context) {
      return
    }
    this.disposeParser(context)
    context.activePath = []
    context.completedPaths = []
    context.recentCompletions = []
    context.structureDepth = 0
    context.inString = false
    context.escaped = false
    this.contexts.delete(key)
  }

  public current(): NestedObject {
    return this.schemaInstance
  }

  public getActivePath(): PathSegment[] {
    return [...this.activePath]
  }

  public getCompletedPaths(): PathSegment[][] {
    return this.completedPaths.map((path) => [...path])
  }

  private writeChunk(
    context: ParserContext,
    chunk: string | Uint8Array,
    opts: ParserOptions
  ): IngestOutcome {
    if (!context.parser) {
      return { completions: [], closed: true }
    }
    this.updateStructureDepth(context, chunk)
    try {
      context.parser.write(chunk)
    } catch (error) {
      if (typeof context.parser.onError === 'function') {
        context.parser.onError(error as Error)
      }
      this.resetContext(context, opts)
    }
    const completed = context.recentCompletions
    context.recentCompletions = []
    const closed = context.structureDepth <= 0
    return {
      completions: completed.map((path) => [...path]),
      closed,
    }
  }

  private static readonly textDecoder =
    typeof TextDecoder === 'undefined' ? null : new TextDecoder()

  private updateStructureDepth(context: ParserContext, chunk: string | Uint8Array): void {
    const decoder = SchemaStream.textDecoder
    const text =
      typeof chunk === 'string' ? chunk
      : decoder ? decoder.decode(chunk)
      : Array.from(chunk as Uint8Array)
          .map((code) => String.fromCharCode(code))
          .join('')

    let delta = 0
    let { inString, escaped } = context
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }
        if (char === '\\') {
          escaped = true
          continue
        }
        if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '{' || char === '[') {
        delta++
        continue
      }
      if (char === '}' || char === ']') {
        delta--
      }
    }

    context.structureDepth = Math.max(0, context.structureDepth + delta)
    context.inString = inString
    context.escaped = escaped
  }
}
