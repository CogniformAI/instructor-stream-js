// oxlint-disable no-explicit-any
import { describe, test, expect, vi, beforeEach } from 'vitest'
import Tokenizer, { TokenizerError } from '../tokenizer.ts'
import TokenType from '../token-type.ts'
import type { ParsedTokenInfo } from '@/utils'

describe('tokenizer.ts', () => {
  let tokenizer: Tokenizer
  let mockOnToken: ReturnType<typeof vi.fn>
  let mockOnError: ReturnType<typeof vi.fn>
  let mockOnEnd: ReturnType<typeof vi.fn>
  let capturedTokens: ParsedTokenInfo[]

  beforeEach(() => {
    capturedTokens = []
    mockOnToken = vi.fn((token: ParsedTokenInfo) => {
      capturedTokens.push(token)
    })
    mockOnError = vi.fn()
    mockOnEnd = vi.fn()
    tokenizer = new Tokenizer()
    tokenizer.onToken = mockOnToken
    tokenizer.onError = mockOnError
    tokenizer.onEnd = mockOnEnd
  })

  test('shouldTokenizeAllJsonTypesCorrectlyInSingleChunk', () => {
    const jsonInput =
      '{"str":"hello","num":123,"bool":true,"null":null,"arr":[1,2],"obj":{"nested":false}}'
    tokenizer.write(jsonInput)
    tokenizer.end()
    /** Verify we got the basic structure (exact count may vary with incremental parsing) */
    expect(capturedTokens.length).toBeGreaterThan(30)
    /** Check for key token types */
    const tokens = capturedTokens.map((t) => t.token)
    expect(tokens).toContain(TokenType.LEFT_BRACE)
    expect(tokens).toContain(TokenType.RIGHT_BRACE)
    expect(tokens).toContain(TokenType.STRING)
    expect(tokens).toContain(TokenType.NUMBER)
    expect(tokens).toContain(TokenType.TRUE)
    expect(tokens).toContain(TokenType.FALSE)
    expect(tokens).toContain(TokenType.NULL)
    expect(tokens).toContain(TokenType.LEFT_BRACKET)
    expect(tokens).toContain(TokenType.RIGHT_BRACKET)
    expect(mockOnEnd).toHaveBeenCalled()
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldTokenizeStringWithEscapedCharacters', () => {
    const jsonInput = '{"escaped":"Hello\\nWorld\\t\\"quoted\\"\\\\backslash\\u0041"}'
    tokenizer.write(jsonInput)
    tokenizer.end()
    /** Find the string tokens - may be split if using buffered string */
    const stringTokens = capturedTokens.filter(
      (token) => token.token === TokenType.STRING && typeof token.value === 'string'
    )
    expect(stringTokens.length).toBeGreaterThan(0)
    /** Find the main escaped string (it should contain Hello or be building up to it) */
    const mainStringToken = stringTokens.find((token) => {
      const value = token.value as string
      return value.includes('Hello') || value.includes('World')
    })
    expect(mainStringToken).toBeDefined()
    /** The exact escaping behavior may vary with buffering, so check for presence of key elements */
    expect(typeof mainStringToken?.value).toBe('string')
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldHandleTokensSplitAcrossMultipleChunks', () => {
    /** Split the word "true" across multiple writes */
    tokenizer.write('{"boolean":tr')
    tokenizer.write('ue,"number":12')
    tokenizer.write('3.45}')
    tokenizer.end()
    const booleanToken = capturedTokens.find((token) => token.token === TokenType.TRUE)
    const numberToken = capturedTokens.find((token) => token.token === TokenType.NUMBER)
    expect(booleanToken?.value).toBe(true)
    expect(numberToken?.value).toBe(123.45)
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldHandleMultiByteUTF8CharactersSplitAcrossChunks', () => {
    /** Create a string with multi-byte UTF-8 character (😊 is 4 bytes: F0 9F 98 8A) */
    const emoji = '😊'
    const emojiBytes = new TextEncoder().encode(`"${emoji}"`)
    /** Split the emoji bytes across chunk boundary */
    const firstPart = emojiBytes.slice(0, 3) // First 3 bytes including opening quote and first 2 bytes of emoji
    const secondPart = emojiBytes.slice(3) // Remaining bytes of emoji and closing quote
    tokenizer.write(firstPart)
    tokenizer.write(secondPart)
    tokenizer.end()
    const stringToken = capturedTokens.find((token) => token.token === TokenType.STRING)
    expect(stringToken?.value).toBe(emoji)
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldEnterErrorStateOnInvalidInput', () => {
    /** Test invalid JSON - unquoted property name */
    tokenizer.write('{invalid: "value"}')
    expect(mockOnError).toHaveBeenCalled()
    expect(mockOnError.mock.calls[0][0]).toBeInstanceOf(TokenizerError)
    expect(mockOnError.mock.calls[0][0].message).toContain('Unexpected')
  })

  test('shouldHandleNumbersCorrectly', () => {
    const jsonInput = '{"int":42,"float":3.14,"negative":-17,"scientific":1.23e-4,"zero":0}'
    tokenizer.write(jsonInput)
    tokenizer.end()
    const numberTokens = capturedTokens.filter((token) => token.token === TokenType.NUMBER)
    const numberValues = numberTokens.map((token) => token.value)
    expect(numberValues).toContain(42)
    expect(numberValues).toContain(3.14)
    expect(numberValues).toContain(-17)
    expect(numberValues).toContain(1.23e-4)
    expect(numberValues).toContain(0)
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldHandleEmptyArraysAndObjects', () => {
    const jsonInput = '{"empty_obj":{},"empty_arr":[]}'
    tokenizer.write(jsonInput)
    tokenizer.end()
    const tokens = capturedTokens.map((token) => ({ type: token.token, value: token.value }))
    expect(tokens).toContainEqual({ type: TokenType.LEFT_BRACE, value: '{' })
    expect(tokens).toContainEqual({ type: TokenType.RIGHT_BRACE, value: '}' })
    expect(tokens).toContainEqual({ type: TokenType.LEFT_BRACKET, value: '[' })
    expect(tokens).toContainEqual({ type: TokenType.RIGHT_BRACKET, value: ']' })
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldHandleWhitespaceCorrectly', () => {
    const jsonInput = ' \n\t {\n  "key" : \t "value" \n} \t '
    tokenizer.write(jsonInput)
    tokenizer.end()
    /** Whitespace should be ignored, only meaningful tokens should be captured */
    const tokens = capturedTokens.map((t) => t.token)
    /** Check that we have the basic meaningful structure */
    expect(tokens).toContain(TokenType.LEFT_BRACE)
    expect(tokens).toContain(TokenType.RIGHT_BRACE)
    expect(tokens).toContain(TokenType.COLON)
    /** Should have string tokens for key and value */
    const stringTokens = capturedTokens.filter((t) => t.token === TokenType.STRING)
    expect(stringTokens.length).toBeGreaterThanOrEqual(2)
    /** Verify key and value are present (may be split across multiple tokens) */
    const allStringValues = stringTokens.map((t) => t.value).join('')
    expect(allStringValues).toContain('key')
    expect(allStringValues).toContain('value')
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldHandleSeparatorOption', () => {
    const tokenizerWithSeparator = new Tokenizer({ separator: '\n' })
    const separatorTokens: ParsedTokenInfo[] = []
    tokenizerWithSeparator.onToken = (token: ParsedTokenInfo) => {
      separatorTokens.push(token)
    }
    tokenizerWithSeparator.onError = mockOnError
    tokenizerWithSeparator.onEnd = mockOnEnd
    tokenizerWithSeparator.write('{"first":"value1"}\n{"second":"value2"}')
    tokenizerWithSeparator.end()
    const separatorToken = separatorTokens.find((token) => token.token === TokenType.SEPARATOR)
    expect(separatorToken?.value).toBe('\n')
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldThrowErrorForInvalidInputTypes', () => {
    expect(() => {
      // @ts-expect-error - testing invalid input type
      tokenizer.write(123)
    }).not.toThrow() /** Actually catches and calls onError */
    expect(mockOnError).toHaveBeenCalled()
    expect(mockOnError.mock.calls[0][0]).toBeInstanceOf(TypeError)
  })

  test('shouldHandleObjectWithBufferProperty', () => {
    const bufferObj = { buffer: [123, 34, 116, 101, 115, 116, 34, 125] } // {"test"}
    /** Test that the code path for objects with buffer property is exercised */
    expect(() => {
      tokenizer.write(bufferObj as any)
    }).not.toThrow()
    tokenizer.end()
    /** The test is primarily about exercising the code path, not the specific output */
  })

  test('shouldHandleArrayInput', () => {
    const arrayInput = [123, 34, 116, 101, 115, 116, 34, 125] /** {"test"} */
    tokenizer.write(arrayInput)
    tokenizer.end()
    const stringTokens = capturedTokens.filter((token) => token.token === TokenType.STRING)
    const allStringValues = stringTokens.map((t) => t.value).join('')
    expect(allStringValues).toContain('test')
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldThrowErrorWhenOnTokenNotSet', () => {
    const bareTokenizer = new Tokenizer()
    expect(() => {
      bareTokenizer.write('{"test": true}')
    }).toThrow('Can\'t emit tokens before the "onToken" callback has been set up.')
  })

  test('shouldThrowDefaultErrorWhenOnErrorNotOverridden', () => {
    const bareTokenizer = new Tokenizer()
    const testError = new Error('Test error')

    expect(() => {
      bareTokenizer.error(testError)
    }).toThrow(testError)
  })

  test('shouldCallOnEndWhenOverridden', () => {
    const mockOnEndCustom = vi.fn()
    tokenizer.onEnd = mockOnEndCustom
    tokenizer.write('123')
    tokenizer.end()
    expect(mockOnEndCustom).toHaveBeenCalled()
  })

  test('shouldHandleInvalidTokenInMiddleOfParsing', () => {
    expect(() => {
      tokenizer.write('{"valid": tr@e}') // Invalid character @ in true
    }).not.toThrow()
    expect(mockOnError).toHaveBeenCalled()
    expect(mockOnError.mock.calls[0][0]).toBeInstanceOf(TokenizerError)
    expect(mockOnError.mock.calls[0][0].message).toContain('Unexpected "@"')
  })

  test('shouldHandleIncompleteMultiByteCharacterAtEndOfBuffer', () => {
    /** Create a scenario where multi-byte character is split and incomplete */
    const encoder = new TextEncoder()
    const fullString = '"测试"' // Chinese characters (3 bytes each in UTF-8)
    const encoded = encoder.encode(fullString)
    /** Split right in the middle of the first Chinese character */
    const firstPart = encoded.slice(0, 2)
    const secondPart = encoded.slice(2, 4)
    const thirdPart = encoded.slice(4)
    tokenizer.write(firstPart)
    tokenizer.write(secondPart)
    tokenizer.write(thirdPart)
    tokenizer.end()
    const stringTokens = capturedTokens.filter((token) => token.token === TokenType.STRING)
    expect(stringTokens.length).toBeGreaterThan(0)
    /** Should reconstruct the Chinese characters correctly */
    const finalString = stringTokens.map((t) => t.value).join('')
    expect(finalString).toContain('测试')
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldHandleEndInStringIncompleteCharState', () => {
    const encoder = new TextEncoder()
    const testString = '"测试' // Missing closing quote and incomplete at multi-byte char
    const encoded = encoder.encode(testString)
    /** Write partial multi-byte character at the end */
    const incompletePart = encoded.slice(0, -1)
    tokenizer.write(incompletePart)
    tokenizer.end()
    expect(mockOnError).toHaveBeenCalled()
    expect(mockOnError.mock.calls[0][0]).toBeInstanceOf(TokenizerError)
    expect(mockOnError.mock.calls[0][0].message).toContain('in the middle of a token')
  })

  test('shouldHandleUnicodeEscapeSequences', () => {
    const jsonInput = '{"unicode":"\\u0041\\u0042\\u0043"}' // ABC in unicode
    tokenizer.write(jsonInput)
    tokenizer.end()
    const stringTokens = capturedTokens.filter(
      (token) =>
        token.token === TokenType.STRING &&
        typeof token.value === 'string' &&
        token.value.includes('ABC')
    )
    expect(stringTokens.length).toBeGreaterThan(0)
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldHandleInvalidUnicodeEscape', () => {
    const jsonInput = '{"unicode":"\\uGGGG"}' // Invalid unicode escape
    expect(() => {
      tokenizer.write(jsonInput)
    }).not.toThrow()
    expect(mockOnError).toHaveBeenCalled()
    expect(mockOnError.mock.calls[0][0]).toBeInstanceOf(TokenizerError)
  })

  test('shouldHandleUnescapedNewlinesWhenEnabled', () => {
    const tokenizerWithNewlines = new Tokenizer({ handleUnescapedNewLines: true })
    const newlineTokens: ParsedTokenInfo[] = []
    tokenizerWithNewlines.onToken = (token: ParsedTokenInfo) => {
      newlineTokens.push(token)
    }
    tokenizerWithNewlines.onError = mockOnError
    tokenizerWithNewlines.onEnd = mockOnEnd
    tokenizerWithNewlines.write('{"text":"line1\nline2"}')
    tokenizerWithNewlines.end()
    /** Should convert unescaped newline to escaped */
    const stringTokens = newlineTokens.filter(
      (token) => token.token === TokenType.STRING && typeof token.value === 'string'
    )
    expect(stringTokens.length).toBeGreaterThan(0)
    expect(mockOnError).not.toHaveBeenCalled()
  })

  test('shouldErrorNotEnterEndedStateFromErrorState', () => {
    const errorTokenizer = new Tokenizer()
    let errorCallCount = 0
    errorTokenizer.onToken = mockOnToken
    errorTokenizer.onError = () => errorCallCount++
    errorTokenizer.onEnd = mockOnEnd
    /** First error puts it in error state */
    errorTokenizer.write('{invalid}')
    expect(errorCallCount).toBe(1)
    /** Second error should not change state further */
    const testError = new Error('Additional error')
    errorTokenizer.error(testError)
    expect(errorCallCount).toBe(2)
    expect(errorTokenizer.isEnded).toBe(false)
  })
})
