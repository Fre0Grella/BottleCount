/**
 * A result that carries its failure instead of throwing it.
 *
 * Repositories return these because the difference between "no such user" and
 * "D1 is unreachable" decides an HTTP status, and an exception flattens both
 * into a 500 unless every caller remembers to inspect it.
 */
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
