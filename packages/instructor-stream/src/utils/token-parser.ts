/**
 * This file has been modified -  but the majority pulled directly from
 *  https://www.npmjs.com/package/@streamparser/json
 *  https://github.com/juanjoDiaz/streamparser-json
 *
 *  Copyright (c) 2020 Juanjo Diaz
 *  https://github.com/juanjoDiaz
 *
 */

import TokenType from './token-type.ts'

export type JsonPrimitive = string | number | boolean | null
export type JsonKey = string | number | undefined
export type JsonObject = { [key: string]: JsonPrimitive | JsonStruct }
export type JsonArray = (JsonPrimitive | JsonStruct)[]
export type JsonStruct = JsonObject | JsonArray

export const enum TokenParserMode {
  OBJECT,
  ARRAY,
}

export interface StackElement {
  key: JsonKey
  value: JsonStruct
  mode?: TokenParserMode
  emit: boolean
}

export interface ParsedTokenInfo {
  token: TokenType
  value: JsonPrimitive
  offset?: number
  partial?: boolean
}

export interface ParsedElementInfo {
  value: JsonPrimitive | JsonStruct
  parent?: JsonStruct
  key?: JsonKey
  stack: StackElement[]
}

export const enum TokenParserState {
  VALUE,
  KEY,
  COLON,
  COMMA,
  ENDED,
  ERROR,
  SEPARATOR,
}

function TokenParserStateToString(state: TokenParserState): string {
  return ['VALUE', 'KEY', 'COLON', 'COMMA', 'ENDED', 'ERROR', 'SEPARATOR'][state]
}

export interface TokenParserOptions {
  paths?: string[]
  keepStack?: boolean
  separator?: string
  strictRootObject?: boolean
}

const defaultOpts: TokenParserOptions = {
  paths: undefined,
  keepStack: true,
  separator: undefined,
  strictRootObject: false,
}

export class TokenParserError extends Error {
  name = 'TokenParserError'
  constructor(message: string) {
    super(message)
  }
}

export default class TokenParser {
  private readonly paths?: (string[] | undefined)[]
  private readonly keepStack: boolean
  private readonly separator?: string
  private readonly strictRootObject: boolean
  state: TokenParserState = TokenParserState.VALUE
  mode: TokenParserMode | undefined = undefined
  key: JsonKey = undefined
  value: JsonStruct | undefined = undefined
  stack: StackElement[] = []
  private rootSeen = false

  constructor(opts?: TokenParserOptions) {
    opts = { ...defaultOpts, ...opts }

    if (opts.paths) {
      this.paths = opts.paths.map((path) => {
        if (path === undefined || path === '$*') {
          return undefined
        }
        if (!path.startsWith('$')) {
          throw new TokenParserError(`Invalid selector "${path}". Should start with "$".`)
        }
        const pathParts = path.split('.').slice(1)
        if (pathParts.includes('')) {
          throw new TokenParserError(`Invalid selector "${path}". ".." syntax not supported.`)
        }
        return pathParts
      })
    }
    this.keepStack = true
    this.separator = opts.separator
    this.strictRootObject = !!opts.strictRootObject
  }

  private shouldEmit(): boolean {
    if (!this.paths) {
      return true
    }

    return this.paths.some((path) => {
      if (path === undefined) {
        return true
      }
      if (path.length !== this.stack.length) {
        return false
      }

      for (let i = 0; i < path.length - 1; i++) {
        const selector = path[i]
        const { key } = this.stack[i + 1]
        if (selector === '*') {
          continue
        }
        if (selector !== key) {
          return false
        }
      }

      const selector = path[path.length - 1]
      if (selector === '*') {
        return true
      }
      return selector === this.key?.toString()
    })
  }

  private push(): void {
    this.stack.push({
      key: this.key,
      value: this.value as JsonStruct,
      mode: this.mode,
      emit: this.shouldEmit(),
    })
  }

  private pop(): void {
    const value = this.value

    let emit
    const popped = this.stack.pop() as StackElement
    this.key = popped.key
    this.value = popped.value
    this.mode = popped.mode
    emit = popped.emit

    this.state = this.mode !== undefined ? TokenParserState.COMMA : TokenParserState.VALUE

    this.emit(value as JsonPrimitive | JsonStruct, emit)
  }

  private emit(value: JsonPrimitive | JsonStruct, emit: boolean): void {
    if (!this.keepStack && this.value && this.stack.every((item) => !item.emit)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (this.value as JsonStruct as any)[this.key as string | number]
    }

    if (emit) {
      this.onValue({
        value,
        key: this.key,
        parent: this.value,
        stack: this.stack,
      })
    }

    if (this.stack.length === 0) {
      if (this.separator) {
        this.state = TokenParserState.SEPARATOR
      } else if (this.separator === undefined) {
        this.end()
      }
      this.rootSeen = false
      // else if separator === '', expect next JSON object.
    }
  }

  public get isEnded(): boolean {
    return this.state === TokenParserState.ENDED
  }

  public write({ token, value, partial }: Omit<ParsedTokenInfo, 'offset'>): void {
    if (partial) {
      return
    }

    if (
      !this.rootSeen &&
      this.strictRootObject &&
      this.state === TokenParserState.VALUE &&
      this.stack.length === 0
    ) {
      if (token !== TokenType.LEFT_BRACE) {
        this.rootSeen = true
        this.error(new TokenParserError('Root must be an object'))
        return
      }
      this.rootSeen = true
    }

    if (this.state === TokenParserState.VALUE) {
      if (
        token === TokenType.STRING ||
        token === TokenType.NUMBER ||
        token === TokenType.TRUE ||
        token === TokenType.FALSE ||
        token === TokenType.NULL
      ) {
        if (this.mode === TokenParserMode.OBJECT) {
          ;(this.value as JsonObject)[this.key as string] = value
          this.state = TokenParserState.COMMA
        } else if (this.mode === TokenParserMode.ARRAY) {
          ;(this.value as JsonArray).push(value)
          this.state = TokenParserState.COMMA
        }

        this.emit(value, this.shouldEmit())
        return
      }

      if (token === TokenType.LEFT_BRACE) {
        this.push()
        if (this.mode === TokenParserMode.OBJECT) {
          this.value = (this.value as JsonObject)[this.key as string] = {}
        } else if (this.mode === TokenParserMode.ARRAY) {
          const val = {}
          ;(this.value as JsonArray).push(val)
          this.value = val
        } else {
          this.value = {}
        }
        this.mode = TokenParserMode.OBJECT
        this.state = TokenParserState.KEY
        this.key = undefined
        return
      }

      if (token === TokenType.LEFT_BRACKET) {
        this.push()
        if (this.mode === TokenParserMode.OBJECT) {
          this.value = (this.value as JsonObject)[this.key as string] = []
        } else if (this.mode === TokenParserMode.ARRAY) {
          const val: JsonArray = []
          ;(this.value as JsonArray).push(val)
          this.value = val
        } else {
          this.value = []
        }
        this.mode = TokenParserMode.ARRAY
        this.state = TokenParserState.VALUE
        this.key = 0
        return
      }

      if (
        this.mode === TokenParserMode.ARRAY &&
        token === TokenType.RIGHT_BRACKET &&
        (this.value as JsonArray).length === 0
      ) {
        this.pop()
        return
      }
    }

    if (this.state === TokenParserState.KEY) {
      if (token === TokenType.STRING) {
        this.key = value as string
        this.state = TokenParserState.COLON
        return
      }

      if (token === TokenType.RIGHT_BRACE && Object.keys(this.value as JsonObject).length === 0) {
        this.pop()
        return
      }
    }

    if (this.state === TokenParserState.COLON && token === TokenType.COLON) {
      this.state = TokenParserState.VALUE
      return
    }

    if (this.state === TokenParserState.COMMA) {
      if (token === TokenType.COMMA) {
        if (this.mode === TokenParserMode.ARRAY) {
          this.state = TokenParserState.VALUE
          ;(this.key as number)++
          return
        }

        if (this.mode === TokenParserMode.OBJECT) {
          this.state = TokenParserState.KEY
          return
        }
      }

      if (
        (token === TokenType.RIGHT_BRACE && this.mode === TokenParserMode.OBJECT) ||
        (token === TokenType.RIGHT_BRACKET && this.mode === TokenParserMode.ARRAY)
      ) {
        this.pop()
        return
      }
    }

    if (
      this.state === TokenParserState.SEPARATOR &&
      token === TokenType.SEPARATOR &&
      value === this.separator
    ) {
      this.state = TokenParserState.VALUE
      return
    }

    this.error(
      new TokenParserError(
        `Unexpected ${TokenType[token]} (${JSON.stringify(
          value
        )}) in state ${TokenParserStateToString(this.state)}`
      )
    )
    return
  }

  public error(err: Error): void {
    if (this.state !== TokenParserState.ENDED) {
      this.state = TokenParserState.ERROR
    }

    this.onError(err)
  }

  public end(): void {
    if (
      (this.state !== TokenParserState.VALUE && this.state !== TokenParserState.SEPARATOR) ||
      this.stack.length > 0
    ) {
      this.error(
        new Error(
          `Parser ended in mid-parsing (state: ${TokenParserStateToString(
            this.state
          )}). Either not all the data was received or the data was invalid.`
        )
      )
    } else {
      this.state = TokenParserState.ENDED
      this.onEnd()
    }
  }

  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  public onValue(_parsedElementInfo: ParsedElementInfo): void {
    throw new TokenParserError('Can\'t emit data before the "onValue" callback has been set up.')
  }

  public onError(err: Error): void {
    // Override me
    throw err
  }

  public onEnd(): void {
    // Override me
  }
}
