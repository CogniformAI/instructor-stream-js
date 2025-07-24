import { describe, test, expect, vi, beforeEach } from 'vitest'
import JSONParser from '../json-parser.ts'
import TokenType from '../token-type.ts'
import type { ParsedElementInfo } from '@/utils'

describe('json-parser.ts', () => {
  let parser: JSONParser
  let mockOnToken: ReturnType<typeof vi.fn>
  let mockOnValue: ReturnType<typeof vi.fn>
  let mockOnError: ReturnType<typeof vi.fn>
  let mockOnEnd: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockOnToken = vi.fn()
    mockOnValue = vi.fn()
    mockOnError = vi.fn()
    mockOnEnd = vi.fn()

    parser = new JSONParser()
    parser.onToken = mockOnToken
    parser.onValue = mockOnValue
    parser.onError = mockOnError
    parser.onEnd = mockOnEnd
  })

  test('shouldCoordinateTokenizerAndParserLifecycle', () => {
    const jsonInput = '{"key": "value"}'
    parser.write(jsonInput)
    parser.end()
    expect(parser.isEnded).toBe(true)
    expect(mockOnEnd).toHaveBeenCalled()
  })

  test('shouldHandleTokenizerEndBeforeParser', () => {
    /** Create a scenario where tokenizer might end before parser */
    const jsonInput = '42' // Simple number
    parser.write(jsonInput)
    parser.end()
    expect(parser.isEnded).toBe(true)
    expect(mockOnEnd).toHaveBeenCalled()
  })

  test('shouldHandleParserEndBeforeTokenizer', () => {
    /** Test the coordination when parser ends first */
    const jsonInput = '{"incomplete":'
    parser.write(jsonInput)
    /** Force end without completing JSON */
    parser.end()
    /** Should still coordinate properly - may or may not be ended depending on internal state */
    expect(mockOnError).toHaveBeenCalled()
  })

  test('shouldPropagateErrorsFromTokenParserToTokenizer', () => {
    /** Create invalid JSON that will cause token parser errors */
    const invalidJson = '{"key": invalid_token}'
    parser.write(invalidJson)
    expect(mockOnError).toHaveBeenCalled()
  })

  test('shouldCallOnTokenForValueTokensOnly', () => {
    const jsonInput = '{"string":"hello","number":42,"boolean":true,"null":null}'
    parser.write(jsonInput)
    parser.end()
    /** onToken should have been called for value tokens */
    expect(mockOnToken).toHaveBeenCalled()
    /** Verify that onToken was called with the expected structure */
    const tokenCalls = mockOnToken.mock.calls
    expect(tokenCalls.length).toBeGreaterThan(0)
    /** Each call should have parser state and tokenizer info */
    tokenCalls.forEach((call) => {
      const [tokenInfo] = call
      expect(tokenInfo).toHaveProperty('parser')
      expect(tokenInfo).toHaveProperty('tokenizer')
      expect(tokenInfo.parser).toHaveProperty('state')
      expect(tokenInfo.parser).toHaveProperty('key')
      expect(tokenInfo.parser).toHaveProperty('mode')
      expect(tokenInfo.parser).toHaveProperty('stack')
      expect(tokenInfo.tokenizer).toHaveProperty('token')
      expect(tokenInfo.tokenizer).toHaveProperty('value')
    })
  })

  test('shouldFilterNonValueTokensFromOnToken', () => {
    const jsonInput = '{"key": "value"}'
    parser.write(jsonInput)
    parser.end()
    /** Verify that structural tokens (braces, colons, etc.) are not passed to onToken */
    const tokenCalls = mockOnToken.mock.calls
    const tokenTypes = tokenCalls.map((call) => call[0].tokenizer.token)
    /** Should only contain value token types */
    const valueTokenTypes = [
      TokenType.STRING,
      TokenType.NUMBER,
      TokenType.TRUE,
      TokenType.FALSE,
      TokenType.NULL,
    ]
    tokenTypes.forEach((tokenType) => {
      expect(valueTokenTypes).toContain(tokenType)
    })
    /** Should not contain structural tokens */
    const structuralTokens = [
      TokenType.LEFT_BRACE,
      TokenType.RIGHT_BRACE,
      TokenType.COLON,
      TokenType.COMMA,
    ]
    structuralTokens.forEach((structuralToken) => {
      expect(tokenTypes).not.toContain(structuralToken)
    })
  })

  test('shouldCallOnValueWhenValuesAreCompleted', () => {
    const jsonInput = '{"name": "John", "age": 30}'
    parser.write(jsonInput)
    parser.end()
    expect(mockOnValue).toHaveBeenCalled()
    /** Check that onValue was called with ParsedElementInfo */
    const valueCalls = mockOnValue.mock.calls
    valueCalls.forEach((call) => {
      const [elementInfo] = call as [ParsedElementInfo]
      expect(elementInfo).toHaveProperty('value')
      expect(elementInfo).toHaveProperty('key')
      expect(elementInfo).toHaveProperty('parent')
      expect(elementInfo).toHaveProperty('stack')
    })
  })

  test('shouldHandleMultipleCallbackReassignments', () => {
    const firstOnToken = vi.fn()
    const secondOnToken = vi.fn()
    /** Test that callbacks can be reassigned without errors */
    parser.onToken = firstOnToken
    parser.write('{"test": "value"}')
    /** Reassign the callback */
    parser.onToken = secondOnToken
    parser.end()
    /** At least one callback should have been called */
    const totalCalls = firstOnToken.mock.calls.length + secondOnToken.mock.calls.length
    expect(totalCalls).toBeGreaterThan(0)
  })

  test('shouldHandleErrorCallbackAssignment', () => {
    const customErrorHandler = vi.fn()
    parser.onError = customErrorHandler
    /** Trigger an error with invalid JSON */
    parser.write('{"invalid": }')
    expect(customErrorHandler).toHaveBeenCalled()
    expect(customErrorHandler.mock.calls[0][0]).toBeInstanceOf(Error)
  })

  test('shouldHandleEndCallbackWithTokenizerCoordination', () => {
    const customEndHandler = vi.fn()
    parser.onEnd = customEndHandler
    parser.write('{"test": "value"}')
    parser.end()
    expect(customEndHandler).toHaveBeenCalled()
    expect(parser.isEnded).toBe(true)
  })

  test('shouldHandleEndCallbackWhenTokenizerNotEnded', () => {
    /** Create a scenario where parser ends but tokenizer might still be active */
    const customEndHandler = vi.fn()
    parser.onEnd = customEndHandler
    /** Write complete JSON to ensure proper parsing */
    parser.write('{"complete": "value"}')
    parser.end()
    expect(customEndHandler).toHaveBeenCalled()
  })

  test('shouldCoordinateIsEndedStateCorrectly', () => {
    expect(parser.isEnded).toBe(false)
    parser.write('{"test": "value"}')
    /** State might change depending on internal parsing state */
    parser.end()
    expect(parser.isEnded).toBe(true)
  })

  test('shouldHandleWriteAfterEnd', () => {
    parser.write('{"first": "value"}')
    parser.end()
    expect(parser.isEnded).toBe(true)
    /** Writing after end should not cause issues */
    expect(() => {
      parser.write('{"second": "value"}')
    }).not.toThrow()
  })

  test('shouldHandleMultipleEndCalls', () => {
    parser.write('{"test": "value"}')
    parser.end()
    expect(parser.isEnded).toBe(true)
    const endCallCount = mockOnEnd.mock.calls.length
    /** Call end again */
    parser.end()
    /** Should still be ended and not call onEnd again */
    expect(parser.isEnded).toBe(true)
    expect(mockOnEnd.mock.calls.length).toBe(endCallCount)
  })

  test('shouldHandleComplexNestedStructures', () => {
    const complexJson = `{
      "users": [
        {"id": 1, "name": "Alice", "active": true},
        {"id": 2, "name": "Bob", "active": false}
      ],
      "metadata": {
        "count": 2,
        "created": "2024-01-01",
        "tags": ["test", "users"]
      }
    }`
    parser.write(complexJson)
    parser.end()
    expect(mockOnToken).toHaveBeenCalled()
    expect(mockOnValue).toHaveBeenCalled()
    expect(mockOnEnd).toHaveBeenCalled()
    expect(parser.isEnded).toBe(true)
  })

  test('shouldPassCorrectParserStateToOnToken', () => {
    const jsonInput = '{"key": "value", "number": 42}'
    parser.write(jsonInput)
    parser.end()
    const tokenCalls = mockOnToken.mock.calls
    expect(tokenCalls.length).toBeGreaterThan(0)
    /** Check that parser state information is correctly passed */
    tokenCalls.forEach((call) => {
      const [tokenInfo] = call
      const { parser: parserState, tokenizer: tokenizerInfo } = tokenInfo
      /** Parser state should contain valid information */
      expect(typeof parserState.state).toBe('number')
      expect(['string', 'number', 'undefined'].includes(typeof parserState.key)).toBe(true)
      expect(Array.isArray(parserState.stack)).toBe(true)
      /** Tokenizer info should contain valid token information */
      expect(typeof tokenizerInfo.token).toBe('number')
      expect(tokenizerInfo.value).toBeDefined()
    })
  })
})
