import { requireContact } from '../../../shared/contact';
import type { InviteAnswer, InviteOpenDTO } from '../../../shared/invites';
import type { ApiResult } from '../../lib/api/request';
import { formatLocalDate } from '../../lib/dates';
import { safeLocal } from '../../lib/safeStorage';

/**
 * The guest's side of an invite: what the invite page (`/i/<slug>`) remembers
 * in this browser, what comes back from Google, and how an answer is checked
 * and what the server's reply means. The page holds the state; this holds the
 * rules.
 */

// ── What this browser remembers ─────────────────────────────────────────────

// Where storage is blocked (private windows, blocked site data) a guest is
// counted as a new visitor on their next visit, which overstates "reached"
// slightly — far better than refusing to let them RSVP at all.

/** Which guest this browser already is, if it has been here before. */
export function rememberedInviteId(slug: string): string | null {
  return safeLocal.get(`bc-invite:${slug}`);
}

export function rememberInviteId(slug: string, id: string): void {
  safeLocal.set(`bc-invite:${slug}`, id);
}

export interface ContactDraft {
  email: string;
  phone: string;
}

/**
 * The email and phone this browser last confirmed with.
 *
 * Kept here because the server never hands them back — the invite id that
 * identifies a guest is a bearer token, and a page that echoed contact details
 * to whoever holds it would leak them. Remembering them locally is what saves a
 * guest who changes their answer from typing them again.
 */
export function rememberedContact(slug: string): ContactDraft {
  const stored = safeLocal.getJSON(`bc-invite-contact:${slug}`);
  const parsed = (stored && typeof stored === 'object' ? stored : {}) as Record<
    string,
    unknown
  >;
  return {
    email: typeof parsed['email'] === 'string' ? parsed['email'] : '',
    phone: typeof parsed['phone'] === 'string' ? parsed['phone'] : '',
  };
}

export function rememberContact(slug: string, contact: ContactDraft): void {
  safeLocal.setJSON(`bc-invite-contact:${slug}`, contact);
}

// ── Back from Google ────────────────────────────────────────────────────────

/**
 * What Google sent back in the URL fragment: an error to show, or the profile
 * (null when the fragment was mangled — the form is still there to type into).
 */
export type GoogleReturn =
  | { error: string }
  | { profile: { name?: string; email?: string } | null };

/**
 * Reads the Worker's `#google=<base64url JSON>` or `#google_error=<why>` off a
 * `location.hash`, or null when the guest did not come back from Google. The
 * fragment never reaches a server, and the invite endpoints never return a
 * guest's email (#21), so this is how the verified one gets into the form.
 */
export function readGoogleReturn(hash: string): GoogleReturn | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const encoded = params.get('google');
  const failed = params.get('google_error');
  if (failed) {
    return {
      error:
        failed === 'email'
          ? 'Google didn’t share a verified email. Type yours below.'
          : 'Google sign-in didn’t finish. Try again, or type your email.',
    };
  }
  if (!encoded) return null;
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!raw || typeof raw !== 'object') return { profile: null };
    const { name, email } = raw as Record<string, unknown>;
    return {
      profile: {
        ...(typeof name === 'string' ? { name } : {}),
        ...(typeof email === 'string' ? { email } : {}),
      },
    };
  } catch {
    return { profile: null };
  }
}

// ── Answering ───────────────────────────────────────────────────────────────

const CONTACT_ERRORS: Record<string, string> = {
  contact_required:
    'Add an email or a phone number — it’s where your ticket goes.',
  invalid_email: 'That email doesn’t look right.',
  invalid_phone: 'That phone number doesn’t look right.',
};

/** Whether this answer asks how to reach the guest: a yes to a paid party. */
export function needsContact(
  answer: InviteAnswer,
  paidParty: boolean,
): boolean {
  return answer === 'confirmed' && paidParty;
}

export interface AnswerBody {
  name: string;
  answer: InviteAnswer;
  email?: string;
  phone?: string;
}

/**
 * The answer as the server takes it, or what to tell the guest first. Checked
 * here as well as on the server, so the guest hears what is wrong before the
 * round trip — with the same rules, so the two never disagree.
 */
export function answerBody(
  answer: InviteAnswer,
  form: { name: string; email: string; phone: string; paidParty: boolean },
): AnswerBody | { error: string | null } {
  const name = form.name.trim();
  if (!name) return { error: 'Pop your name in first.' };
  if (!needsContact(answer, form.paidParty)) return { name, answer };
  const contact = requireContact(form.email, form.phone);
  if ('error' in contact)
    return { error: CONTACT_ERRORS[contact.error] ?? null };
  return {
    name,
    answer,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
  };
}

/** What the page does with the server's reply to an answer. */
export type AnswerOutcome =
  | { kind: 'answered'; invite: InviteOpenDTO }
  /** The link is closed: the page shows "expired". */
  | { kind: 'gone' }
  /** Stay on the form, say `error`, and update the party with `party`. */
  | {
      kind: 'retry';
      error: string | null;
      party?: { paid: true } | { full: true };
    };

export function answerOutcome(result: ApiResult<InviteOpenDTO>): AnswerOutcome {
  if (result.ok && result.value) {
    return { kind: 'answered', invite: result.value };
  }
  const failure = result.ok ? null : result.error;
  const code = failure?.kind === 'http' ? failure.code : null;

  if (code && CONTACT_ERRORS[code]) {
    // The host made the party paid while this guest had the page open, or the
    // server read the details differently. Either way, say which field.
    return {
      kind: 'retry',
      error: CONTACT_ERRORS[code] ?? null,
      ...(code === 'contact_required' ? { party: { paid: true } } : {}),
    };
  }
  if (code === 'party_full') {
    // The card flips to "full" — someone took the last place while this guest
    // was typing.
    return {
      kind: 'retry',
      error: 'That was the last place — the party just filled up.',
      party: { full: true },
    };
  }
  // The host closed the link while this guest had the page open. Any other 404
  // here is a stale invite on a party that is still open, not a gone one.
  if (code === 'party_not_found') return { kind: 'gone' };
  return { kind: 'retry', error: "Couldn't send that. Try again in a moment." };
}

// ── Passing it on ───────────────────────────────────────────────────────────

/**
 * What travels with a confirmed guest's forward link. Worded from the guest's
 * side — they are the one sending it, to their own friend — not the host's
 * "you're invited".
 */
export function forwardMessage(
  party: { name: string; date: string },
  where: string,
  link: string,
): string {
  const day = formatLocalDate(party.date, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const at = where ? ` at ${where}` : '';
  return `I'm going to ${party.name} on ${day}${at} — come along! RSVP here: ${link}`;
}

/** The forward QR's download name: the party's name as a file name. */
export function forwardQrFileName(partyName: string | undefined): string {
  return `${(partyName ?? 'party').replace(/[^\w-]+/g, '-').toLowerCase()}-invite.png`;
}
