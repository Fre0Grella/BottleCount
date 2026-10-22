import { getKey, setKey } from './db';
import type { TicketQRPayload } from '../../shared/tickets';
import {
  base64ToBytes,
  bytesToBase64,
  encodeTicketPayload,
  parseSignedTicket,
} from '../../shared/tickets';
import type { Party } from './types';

/**
 * Signing and checking tickets.
 *
 * The key is per *party*, not per device. It used to be per device, generated
 * into whichever browser first issued a ticket — which meant a co-organiser's
 * phone could not verify anything the owner's phone had produced. It did not
 * miscount guests; it rejected all of them.
 *
 * So a shared party carries its key on the server (`SharedPartyDTO.ticketKey`),
 * every member is handed the same one, and the door verifies offline with it
 * once it has been fetched — which matters, because doors are in basements.
 * A local-only party still uses a device key, because there is no server to
 * hold one and nobody else to agree with.
 *
 * Keys are persisted as JWKs, never as CryptoKey objects: IndexedDB's
 * structured-clone step throws DataCloneError on a CryptoKey.
 */

export async function importKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
}

/** The fallback key for a party that lives only in this browser. */
async function deviceKey(): Promise<CryptoKey> {
  const stored = await getKey<JsonWebKey | null>('hmac_key', null);
  if (stored) return importKey(stored);

  const key = (await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKey;

  await setKey('hmac_key', await crypto.subtle.exportKey('jwk', key));
  return key;
}

/**
 * The key a party's tickets are signed with.
 *
 * The party's own when it has one — every organiser holds the same — and this
 * browser's otherwise.
 */
async function keyFor(party: Party): Promise<CryptoKey> {
  const jwk = party.publication?.ticketKey;
  return jwk ? importKey(jwk) : deviceKey();
}

/** What a ticket is signed over. Order is fixed; JSON key order is not. */
function canonical(payload: TicketQRPayload): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify([
      payload.code,
      payload.partyId,
      payload.guestName,
      payload.expiresAt,
    ]),
  );
}

/** Signs a payload with a given key — what `signTicket` does once it has one. */
export async function signWithKey(
  key: CryptoKey,
  payload: TicketQRPayload,
): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', key, canonical(payload));
  return `${encodeTicketPayload(payload)}.${bytesToBase64(new Uint8Array(signature))}`;
}

export type TicketCheck =
  | { ok: true; payload: TicketQRPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' };

/**
 * Checks a signed string against a given key. A ticket signed before #18 may
 * read two ways (see `parseSignedTicket`); the reading the signature matches
 * is the one that was signed.
 */
export async function verifyWithKey(
  key: CryptoKey,
  signed: string,
): Promise<TicketCheck> {
  const parsed = parseSignedTicket(signed);
  if (!parsed) return { ok: false, reason: 'malformed' };

  try {
    const signature = base64ToBytes(parsed.signature);
    for (const payload of parsed.readings) {
      if (
        await crypto.subtle.verify('HMAC', key, signature, canonical(payload))
      )
        return { ok: true, payload };
    }
    return { ok: false, reason: 'bad_signature' };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}

export async function signTicket(
  party: Party,
  payload: TicketQRPayload,
): Promise<string> {
  return signWithKey(await keyFor(party), payload);
}

/**
 * Checks a scanned string's signature and nothing else.
 *
 * Whether the guest is actually coming, and whether they already walked in, are
 * questions about the guest list rather than the signature — the door answers
 * those separately (`checkTicket` in `ticket.ts`), because the answers differ
 * per party and per moment while this one never does.
 */
export async function verifyTicket(
  party: Party,
  qrString: string,
): Promise<TicketCheck> {
  return verifyWithKey(await keyFor(party), qrString);
}
