/**
 * A hand-rolled stand-in for a D1 binding: every statement is answered by
 * `answer`, which sees the SQL and its parameters and returns the row (or
 * throws the error) the test needs.
 *
 * Not a database. It runs no SQL, so it cannot say whether a statement is
 * right — that needs a real D1 (see `vitest.config.ts`). What it can pin is
 * what a D1 repository does with what comes back: a row it must read, or an
 * error it must either translate or let through.
 */
export type D1Answer = (
  sql: string,
  params: unknown[],
  method: 'first' | 'run' | 'all',
) => unknown;

export function stubD1(answer: D1Answer): D1Database {
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    first: async () => answer(sql, params, 'first') ?? null,
    run: async () => answer(sql, params, 'run') ?? { meta: { changes: 0 } },
    all: async () => answer(sql, params, 'all') ?? { results: [] },
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}

/** The message D1 throws when a unique index refuses a write. */
export function uniqueViolation(column: string): Error {
  return new Error(
    `D1_ERROR: UNIQUE constraint failed: ${column}: SQLITE_CONSTRAINT`,
  );
}
