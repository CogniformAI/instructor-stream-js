import { ZodError } from 'zod'

/** Base class for all custom errors thrown by Instructor */
export class InstructorError extends Error {
  /** original error that triggered this one */
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'InstructorError'
  }
}

/** Raised when the supplied client is not supported */
export class UnsupportedClientError extends InstructorError {
  constructor(message = 'Unsupported client type', cause?: unknown) {
    super(message, cause)
    this.name = 'UnsupportedClientError'
  }
}

/** Error used to indicate that an operation can be retried */
export class RetryableError extends InstructorError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
    this.name = 'RetryableError'
  }
}

/** Error that should not be retried, but is not a validation failure */
export class NonRetryableError extends InstructorError {
  constructor(message: string, cause?: unknown) {
    super(message, cause)
    this.name = 'NonRetryableError'
  }
}

/** Validation / schema mismatch error from Zod */
export class ValidationError extends InstructorError {
  constructor(
    public readonly issues: ZodError['issues'],
    cause?: ZodError
  ) {
    super('ValidationError', cause)
    this.name = 'ValidationError'
  }
}
