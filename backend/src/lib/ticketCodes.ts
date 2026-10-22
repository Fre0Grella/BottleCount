import {
  generateTicketCode,
  TICKET_CODE_ATTEMPTS,
} from '../../../shared/tickets';
import { newTicketSlug } from '../../../shared/ticketLinks';
import { INVITE_ERRORS } from '../repositories/inviteRepository';
import type { Result } from '../repositories/result';
import { err } from '../repositories/result';

/**
 * Runs a write that needs a value no other row holds, redrawing when the
 * unique index rejects the one it was given (`taken`).
 *
 * A helper rather than a loop at each call site, so a caller states only its
 * statement and inherits the retry policy — and so the policy is testable on
 * its own. Bounded on purpose: an unbounded loop turns a broken RNG or a
 * mis-declared index into a hung request instead of an error.
 */
async function withFreshDraw<T>(
  draw: () => string,
  write: (value: string) => Promise<Result<T>>,
  {
    taken,
    exhausted,
    attempts,
  }: {
    taken: string;
    exhausted: string;
    attempts: number;
  },
): Promise<Result<T>> {
  for (let i = 0; i < attempts; i++) {
    const result = await write(draw());
    if (result.ok || result.error !== taken) {
      // Success, or a failure that retrying would only repeat.
      return result;
    }
  }
  return err(exhausted);
}

/** A write that needs a ticket code free within its party. */
export function withUniqueTicketCode<T>(
  write: (code: string) => Promise<Result<T>>,
  attempts: number = TICKET_CODE_ATTEMPTS,
): Promise<Result<T>> {
  return withFreshDraw(generateTicketCode, write, {
    taken: INVITE_ERRORS.CODE_TAKEN,
    exhausted: INVITE_ERRORS.CODE_UNAVAILABLE,
    attempts,
  });
}

/**
 * A write that needs a short-link slug no invite holds. 60 bits do not collide
 * in practice; three draws make "in practice" moot.
 */
export function withUniqueTicketSlug<T>(
  write: (slug: string) => Promise<Result<T>>,
): Promise<Result<T>> {
  return withFreshDraw(newTicketSlug, write, {
    taken: INVITE_ERRORS.SLUG_TAKEN,
    exhausted: INVITE_ERRORS.SLUG_TAKEN,
    attempts: 3,
  });
}
