/**
 * How a guest can be reached, shared by the Worker and the frontend.
 *
 * A guest of a paid party leaves an email, a phone number, or both when they
 * confirm, so the host can send them their ticket once they have paid.
 * Both sides run the same checks: the form, to say what is wrong before
 * sending, and the server, because the form is not the only thing that can
 * call it.
 *
 * Like the payment identifiers, each returns '' for blank, the stored form when
 * valid, and null when it is neither.
 */

/** RFC 5321's limit on a whole address. */
const EMAIL_MAX = 254;

/**
 * Deliberately loose: something@something.tld. The only real test of an email
 * address is sending to it, and a stricter pattern mostly refuses addresses
 * that work.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export function normaliseEmail(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return '';
  if (trimmed.length > EMAIL_MAX || !EMAIL_SHAPE.test(trimmed)) return null;
  // The domain is case-insensitive; the local part technically is not, but no
  // provider a guest uses treats it that way, and one spelling per address is
  // what lets the host spot a guest who answered twice.
  return trimmed.toLowerCase();
}

/**
 * The country code assumed for a number typed without one. BottleCount's hosts
 * are in Italy, and so are nearly all their guests; anyone else types the `+`.
 */
const DEFAULT_COUNTRY_CODE = '39';

/**
 * A phone number in E.164 (`+393331234567`), which is what WhatsApp addresses
 * by. Spaces, dots, dashes and brackets are ignored; `00` counts as `+`; a
 * number with neither is taken to be Italian.
 */
export function normalisePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s.\-()]/g, '');
  if (compact === '') return '';

  let digits: string;
  if (compact.startsWith('+')) digits = compact.slice(1);
  else if (compact.startsWith('00')) digits = compact.slice(2);
  else digits = DEFAULT_COUNTRY_CODE + compact;

  // E.164 allows at most 15 digits including the country code; fewer than 8 is
  // not a reachable mobile anywhere.
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

/** What an organiser can see of a guest, and what they can set on one. */
export interface GuestContact {
  email: string | null;
  phone: string | null;
}

export type ContactError =
  | 'contact_required'
  | 'invalid_email'
  | 'invalid_phone';

/**
 * What a guest confirming a paid party left to be reached at, or why it is
 * refused: at least one of email and phone, and whichever is given must be
 * real. The invite page and the server both ask this, so they cannot disagree.
 */
export function requireContact(
  emailInput: string,
  phoneInput: string,
): GuestContact | { error: ContactError } {
  const contact = optionalContact(emailInput, phoneInput);
  if ('error' in contact) return contact;
  if (contact.email === null && contact.phone === null) {
    return { error: 'contact_required' };
  }
  return contact;
}

/**
 * Contact details an organiser typed, or why they are refused. Unlike
 * {@link requireContact} both may be blank: blank clears a field, and the guest
 * list is where they are corrected later.
 */
export function optionalContact(
  emailInput: string,
  phoneInput: string,
): GuestContact | { error: ContactError } {
  const email = normaliseEmail(emailInput);
  if (email === null) return { error: 'invalid_email' };
  const phone = normalisePhone(phoneInput);
  if (phone === null) return { error: 'invalid_phone' };
  return { email: email || null, phone: phone || null };
}

/**
 * The contact details a guest's answer stores, or why it is refused.
 *
 * Only a yes to a paid party keeps any: they are there to send a ticket to, and
 * someone who declines, or confirms a free party, is not getting one — so they
 * leave nothing behind. A yes to a paid party needs at least one of the two,
 * whichever the guest is happier to give.
 */
export function answerContact(
  confirmed: boolean,
  paidParty: boolean,
  emailInput: string,
  phoneInput: string,
): GuestContact | { error: ContactError } {
  if (!confirmed || !paidParty) return { email: null, phone: null };
  return requireContact(emailInput, phoneInput);
}

/** The longest guest name kept: enough for a full name, short enough for a row. */
export const GUEST_NAME_MAX = 60;

/** A guest's name as stored — trimmed and bounded. Empty means none was given. */
export function guestName(input: string): string {
  return input.trim().slice(0, GUEST_NAME_MAX);
}
