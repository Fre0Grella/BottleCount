/**
 * Whether `error` is D1 refusing a write because `column` (as `table.column`)
 * must be unique.
 *
 * Only that is a collision a caller can redraw its way out of. Anything else a
 * statement throws — an outage, a bad statement, another constraint — is let
 * through, so it surfaces as the 500 it is instead of being reported as an
 * unlucky draw and retried.
 */
export function isUniqueViolation(error: unknown, column: string): boolean {
  if (!(error instanceof Error)) return false;
  // D1 reports SQLite's message, e.g. "UNIQUE constraint failed:
  // invites.party_id, invites.ticket_code: SQLITE_CONSTRAINT".
  const columns = /UNIQUE constraint failed: ([^:]+)/.exec(error.message)?.[1];
  return !!columns && columns.split(',').some((name) => name.trim() === column);
}
