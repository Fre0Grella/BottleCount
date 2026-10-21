/**
 * How a guest pays the host, shared by the Worker and the frontend.
 *
 * BottleCount never touches the money: the host says where they want to be
 * paid, the guest pays them directly, and the host marks the guest as paid by
 * hand. What lives here is the part both sides must agree on — what a valid
 * identifier looks like, and the links built from it.
 *
 * The host types identifiers, never URLs, and the links are built here. That
 * is the whole safety argument: there is no free-form URL to smuggle a
 * `javascript:` link through, because nothing a host types is ever rendered as
 * an `href` on its own. Satispay and Revolut are the exceptions, since their
 * personal links have no documented format to build from, so each is held to
 * `https://` on its own domain instead.
 */

/** Where the host wants to be paid. Empty strings mean "not offered". */
export interface PaymentDetails {
  /** A PayPal.me username, without the domain. */
  paypal: string;
  /** The host's personal Satispay link, as the app shares it. */
  satispay: string;
  /** The host's revolut.me link, built from their Revtag if that is all they typed. */
  revolut: string;
  /** The bank account holder's name, which an Italian transfer requires. */
  bank_holder: string;
  /** An IBAN without spaces. */
  bank_iban: string;
}

export function emptyPaymentDetails(): PaymentDetails {
  return {
    paypal: '',
    satispay: '',
    revolut: '',
    bank_holder: '',
    bank_iban: '',
  };
}

// ── Identifiers ─────────────────────────────────────────────────────────────
//
// Each of these takes what the host typed and returns the stored form: '' for
// blank, the normalised value when valid, and null when it is neither. Null is
// what the Plan tab shows as an error and what the server drops.

const PAYPAL_USERNAME = /^[A-Za-z0-9]{1,20}$/;

/**
 * Accepts the username alone or any of the ways people paste it: `@name`,
 * `paypal.me/name`, `https://www.paypal.me/name/15`, `paypal.com/paypalme/name`.
 */
export function normalisePaypal(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return '';

  const match =
    /^(?:https?:\/\/)?(?:www\.)?(?:paypal\.me|paypal\.com\/paypalme)\/([^/?#]+)/i.exec(
      trimmed,
    );
  const username = match?.[1] ?? trimmed.replace(/^@/, '');
  return PAYPAL_USERNAME.test(username) ? username : null;
}

/** A pasted link, if it is `https://` on `domain` or one of its subdomains. */
function linkOn(domain: string, input: string): string | null {
  if (input.length > 300) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  // `satispay.com.example.org` ends in neither, which is the point of matching
  // on the dot rather than on the substring.
  const host = url.hostname.toLowerCase();
  const onDomain = host === domain || host.endsWith(`.${domain}`);
  return url.protocol === 'https:' && onDomain ? url.toString() : null;
}

export function normaliseSatispay(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return '';
  return linkOn('satispay.com', trimmed);
}

const REVTAG = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/;

/**
 * Accepts a Revtag (`@name` or `name`) or a revolut.me link, pasted with or
 * without its `https://`. A Revtag becomes `https://revolut.me/name`.
 *
 * There is no documented way to put the amount in a revolut.me link, so the
 * guest types it; the button shows the price beside it.
 */
export function normaliseRevolut(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return '';

  const tag = trimmed.replace(/^@/, '');
  if (REVTAG.test(tag) && !/^revolut\.me$/i.test(tag)) {
    return `https://revolut.me/${tag}`;
  }
  const withScheme = /^[a-z]+:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return linkOn('revolut.me', withScheme);
}

/** SEPA's limit on a beneficiary name. */
const HOLDER_MAX = 70;

export function normaliseHolder(input: string): string {
  return input.trim().replace(/\s+/g, ' ').slice(0, HOLDER_MAX);
}

const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/**
 * An IBAN with its spaces removed, if its check digits add up.
 *
 * The mod-97 check is what catches the transposed pair of digits a host makes
 * copying it off their banking app — a mistake that would otherwise send every
 * guest's money to a stranger, or more likely back to the guest days later.
 */
export function normaliseIban(input: string): string | null {
  const compact = input.replace(/\s+/g, '').toUpperCase();
  if (compact === '') return '';
  if (!IBAN_SHAPE.test(compact)) return null;

  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    // Letters count as two digits (A = 10 … Z = 35); folding them in one at a
    // time keeps the running number small enough for a plain `number`.
    const value = Number.parseInt(char, 36);
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1 ? compact : null;
}

/** `IT60X0542811101000000123456` → `IT60 X054 2811 1010 0000 0123 456`. */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * Every field normalised, with anything invalid dropped to ''.
 *
 * Used where a document arrives from outside the Plan tab's checks — a publish,
 * a co-organiser's patch, a party saved before payments existed.
 */
export function sanitisePaymentDetails(value: unknown): PaymentDetails {
  const raw =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const text = (key: string): string => {
    const field = raw[key];
    return typeof field === 'string' ? field : '';
  };

  return {
    paypal: normalisePaypal(text('paypal')) ?? '',
    satispay: normaliseSatispay(text('satispay')) ?? '',
    revolut: normaliseRevolut(text('revolut')) ?? '',
    bank_holder: normaliseHolder(text('bank_holder')),
    bank_iban: normaliseIban(text('bank_iban')) ?? '',
  };
}

// ── What a confirmed guest sees ─────────────────────────────────────────────

export interface InvitePaymentDTO {
  /** Euros per person, from the party's ticket price. */
  price: number;
  paypalUrl: string | null;
  satispayUrl: string | null;
  revolutUrl: string | null;
  /** Both or neither: an Italian transfer is refused without the holder's name. */
  bank: { holder: string; iban: string } | null;
}

function amount(price: number): string {
  return Number.isInteger(price) ? String(price) : price.toFixed(2);
}

/** PayPal.me fills the amount in when it follows the username. */
export function paypalMeUrl(username: string, price: number): string {
  const base = `https://paypal.me/${username}`;
  return price > 0 ? `${base}/${amount(price)}EUR` : base;
}

/**
 * The payment section of a guest's invite, or null when the host offers no
 * way to pay.
 *
 * Null is also what a party with a ticket price but no methods gets, and that
 * is deliberate: every party starts with a price for the budget maths, so the
 * price alone cannot mean "guests pay" without every existing party suddenly
 * asking for money.
 */
export function invitePayment(
  price: number,
  details: unknown,
): InvitePaymentDTO | null {
  const clean = sanitisePaymentDetails(details);
  const ticketPrice = Number.isFinite(price) && price > 0 ? price : 0;

  const payment: InvitePaymentDTO = {
    price: ticketPrice,
    paypalUrl: clean.paypal ? paypalMeUrl(clean.paypal, ticketPrice) : null,
    satispayUrl: clean.satispay || null,
    revolutUrl: clean.revolut || null,
    bank:
      clean.bank_iban && clean.bank_holder
        ? { holder: clean.bank_holder, iban: clean.bank_iban }
        : null,
  };

  const offered =
    payment.paypalUrl ||
    payment.satispayUrl ||
    payment.revolutUrl ||
    payment.bank;
  return offered ? payment : null;
}

/**
 * Whether guests of this party pay for it: a price above zero and at least one
 * way to pay the host.
 *
 * The price alone cannot decide it, for the same reason {@link invitePayment}
 * returns null without a method: every party starts with one for the budget
 * maths. And a method alone cannot either, since a host may leave their PayPal
 * in place on a party they have since made free.
 *
 * This is what makes a guest's email required, and what puts "paid" in the
 * guest list, so both sides call it rather than each deciding for itself.
 */
export function isPaidParty(price: number, details: unknown): boolean {
  return (
    Number.isFinite(price) &&
    price > 0 &&
    invitePayment(price, details) !== null
  );
}

/** SEPA's limit on the free-text reference of a transfer. */
const REFERENCE_MAX = 140;

/**
 * The *causale* a guest is asked to use on a bank transfer.
 *
 * Party and guest name together, because the host checks their account and
 * marks people as paid by hand, and "Mario Rossi — €15" in a list of transfers
 * means nothing without knowing which party it was for.
 */
export function paymentReference(partyName: string, guestName: string): string {
  return `${partyName.trim()} - ${guestName.trim()}`
    .replace(/\s+/g, ' ')
    .slice(0, REFERENCE_MAX);
}
