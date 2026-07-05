/**
 * Result Type - Functional error handling
 *
 * A discriminated union for operation results that provides type-safe
 * success/error handling without exceptions.
 */

/**
 * Result type for operations that can fail.
 * Discriminated union that's either { ok: true, value: T } or { ok: false, error: E }
 */
export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

/**
 * Create a successful result containing a value.
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

/**
 * Create a failed result containing an error.
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/**
 * Type guard to check if a result is successful.
 */
export function isOk<T, E>(
  result: Result<T, E>
): result is { ok: true; value: T } {
  return result.ok
}

/**
 * Type guard to check if a result is an error.
 */
export function isErr<T, E>(
  result: Result<T, E>
): result is { ok: false; error: E } {
  return !result.ok
}

/**
 * Map over a successful result's value.
 * If the result is an error, returns the error unchanged.
 */
export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value))
  }
  return result
}

/**
 * Map over a failed result's error.
 * If the result is successful, returns the value unchanged.
 */
export function mapError<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (!result.ok) {
    return err(fn(result.error))
  }
  return result
}

/**
 * Unwrap a result, throwing an error if it's a failure.
 * Use sparingly - prefer pattern matching on the result.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value
  }
  throw new Error(
    `Attempted to unwrap an error result: ${
      typeof result.error === 'string'
        ? result.error
        : JSON.stringify(result.error)
    }`
  )
}

/**
 * Get the value from a result or return a default value if it's an error.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value
  }
  return defaultValue
}
