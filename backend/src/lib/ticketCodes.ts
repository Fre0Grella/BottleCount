import {
  generateTicketCode,
  TICKET_CODE_ATTEMPTS,
} from '../../../shared/tickets';
import { INVITE_ERRORS } from '../repositories/inviteRepository';
import type { Result } from '../repositories/result';
import { err } from '../repositories/result';

/**
 * Runs a write that needs a free ticket code, redrawing if the unique index
 * rejects the one it was given.
 *
 * A helper rather than a loop at each call site, so a caller states only its
 * INSERT and inherits the retry policy — and so the policy is testable on its
 * own. Bounded on purpose: an unbounded regenerate loop turns a broken RNG or a
 * mis-declared index into a hung request instead of an error.
 */
export async function withUniqueTicketCode<T>(
  write: (code: string) => Promise<Result<T>>,
  attempts: number = TICKET_CODE_ATTEMPTS,
): Promise<Result<T>> {
  for (let i = 0; i < attempts; i++) {
    const result = await write(generateTicketCode());
    if (result.ok || result.error !== INVITE_ERRORS.CODE_TAKEN) {
      // Success, or a real persistence failure that retrying would only repeat.
      return result;
    }
  }
  return err(INVITE_ERRORS.CODE_UNAVAILABLE);
}
