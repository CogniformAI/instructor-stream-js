// TODO: Should this be converted to literals as TS Enums are now
// discouraged we can use as const instead and get better type inference?
// This looks like what they were doing below, converting to string literals.
enum TokenType {
  LEFT_BRACE,
  RIGHT_BRACE,
  LEFT_BRACKET,
  RIGHT_BRACKET,
  COLON,
  COMMA,
  TRUE,
  FALSE,
  NULL,
  STRING,
  NUMBER,
  SEPARATOR,
}

export function TokenTypeToString(tokenType: TokenType): string {
  return [
    'LEFT_BRACE',
    'RIGHT_BRACE',
    'LEFT_BRACKET',
    'RIGHT_BRACKET',
    'COLON',
    'COMMA',
    'TRUE',
    'FALSE',
    'NULL',
    'STRING',
    'NUMBER',
    'SEPARATOR',
  ][tokenType]
}

export default TokenType
