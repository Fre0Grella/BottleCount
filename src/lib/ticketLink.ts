import type { TicketQRPayload } from '../../shared/tickets';
import { parseSignedTicket } from '../../shared/tickets';
import type { TicketDisplay } from '../../shared/urls';

/**
 * A ticket a guest can open from a link.
 *
 * The signed QR string (`<payload>.<HMAC>`, see `crypto.ts`) is already
 * everything the door needs: it verifies offline against the party's key. So
 * the link carries that string (`ticketUrl` in `shared/urls.ts` builds it) — and the page draws the QR from it — with no
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

export interface OpenedTicket extends TicketDisplay {
  /** Exactly what goes in the QR, and what the door verifies. */
  signed: string;
  payload: TicketQRPayload;
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
  const parsed = parseSignedTicket(signed);
  if (!parsed) return null;
  const { payload } = parsed;

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
