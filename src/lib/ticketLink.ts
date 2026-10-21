import { isTicketSlug } from '../../shared/ticketLinks';
import type { TicketQRPayload } from '../../shared/tickets';

/**
 * A ticket a guest can open from a link.
 *
 * The signed QR string (`<payload>.<HMAC>`, see `crypto.ts`) is already
 * everything the door needs: it verifies offline against the party's key. So
 * the link carries that string — and the page draws the QR from it — with no
 * server storage and no new endpoint.
 *
 * It goes in the URL **fragment**, which browsers never send to any server, so
 * a guest's name travels only between the host's phone and the guest's. The
 * party's name, date and cover ride along for display only; they are not
 * signed, and do not need to be — the door checks the QR, not the page.
 *
 * That is the long form, and it is still how a local-only party sends tickets
 * and how every link sent before #41 opens. A shared party sends a short link
 * instead (`/t/<slug>`, see `shared/ticketLinks.ts`): the server keeps the same
 * signed string and the page fetches it. Either way the QR is identical.
 */

/** What the ticket page shows that the signed payload does not carry. */
export interface TicketDisplay {
  party: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Index into `COVERS`. */
  cover: number;
  /** Start time, `HH:MM`, when there is one. */
  time?: string;
}

export interface OpenedTicket extends TicketDisplay {
  /** Exactly what goes in the QR, and what the door verifies. */
  signed: string;
  payload: TicketQRPayload;
}

/**
 * The one place a ticket URL is spelled. `base` is the app's base path — left
 * out, a build under a prefix would hand out links that miss it.
 */
export function ticketUrl(
  origin: string,
  base: string,
  signed: string,
  display: TicketDisplay,
): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  // URLSearchParams escapes the `+`, `/` and `=` of the base64 halves, and
  // decodes them back in parseTicketHash — never build this by concatenation.
  const params = new URLSearchParams({
    t: signed,
    p: display.party,
    d: display.date,
    c: String(display.cover),
  });
  if (display.time) params.set('h', display.time);
  return `${origin}${prefix}t/#${params.toString()}`;
}

/** A short ticket link: `<origin><base>t/<slug>`. */
export function shortTicketUrl(
  origin: string,
  base: string,
  slug: string,
): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${origin}${prefix}t/${slug}`;
}

/** The slug of a short ticket link's path, or '' on the bare `/t/` page. */
export function ticketSlugFromPath(pathname: string, base: string): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const rest = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname.replace(/^\//, '');
  const match = /^t\/([^/?#]+)\/?$/.exec(rest);
  const slug = match?.[1] ?? '';
  return isTicketSlug(slug) ? slug : '';
}

function isPayload(value: unknown): value is TicketQRPayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p['code'] === 'string' &&
    typeof p['partyId'] === 'string' &&
    typeof p['guestName'] === 'string' &&
    typeof p['expiresAt'] === 'string'
  );
}

/**
 * Reads a ticket back out of `location.hash`. Null when the link is truncated
 * or mangled — a chat app that cut it short, a guest who copied half of it.
 *
 * It does not verify the signature: only the organisers hold the key, and the
 * guest's page has no business with it. The door verifies.
 */
export function parseTicketHash(hash: string): OpenedTicket | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const signed = params.get('t');
  if (!signed) return null;

  const time = params.get('h');
  return openTicket(signed, {
    party: params.get('p') ?? '',
    date: params.get('d') ?? '',
    cover: Number(params.get('c')),
    ...(time ? { time } : {}),
  });
}

/**
 * A ticket from its signed string and what the page shows beside it — the
 * fragment's fields, or what a short link's server answered. Null when the
 * string is not a ticket.
 */
export function openTicket(
  signed: string,
  display: TicketDisplay,
): OpenedTicket | null {
  const [payloadB64, signature, extra] = signed.split('.');
  if (!payloadB64 || !signature || extra !== undefined) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(atob(payloadB64));
  } catch {
    return null;
  }
  if (!isPayload(payload)) return null;

  const cover = display.cover;
  return {
    signed,
    payload,
    party: display.party,
    date: display.date,
    cover: Number.isInteger(cover) && cover >= 0 ? cover : 0,
    ...(display.time ? { time: display.time } : {}),
  };
}
