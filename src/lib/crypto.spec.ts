import { describe, expect, it } from 'vitest';
import type { TicketQRPayload } from '../../shared/tickets';
import { parseSignedTicket } from '../../shared/tickets';
import { importKey, signWithKey, verifyWithKey } from './crypto';

/**
 * A fixed key, so the tickets below are the very strings the app issued before
 * the payload became UTF-8 (#18) — made by that code, with this key, and
 * pasted in. They are what guests already hold, so they must keep verifying.
 */
const jwk: JsonWebKey = {
  kty: 'oct',
  k: 'c2VjcmV0LWtleS1mb3ItdGVzdHMtMDEyMzQ1Njc4OWFiY2RlZg',
  alg: 'HS256',
  ext: true,
  key_ops: ['sign', 'verify'],
};

const payloadFor = (guestName: string): TicketQRPayload => ({
  code: 'AB23C',
  partyId: 'party-1',
  guestName,
  expiresAt: '2026-11-15T05:00:00.000Z',
});

/** Issued before #18 to an ASCII name. */
const ISSUED_ASCII =
  'eyJjb2RlIjoiQUIyM0MiLCJwYXJ0eUlkIjoicGFydHktMSIsImd1ZXN0TmFtZSI6IkdpdWxpYSBCaWFuY2hpIiwiZXhwaXJlc0F0IjoiMjAyNi0xMS0xNVQwNTowMDowMC4wMDBaIn0=.6ACLNlRUlX0IOCtggN3huv90z0WPeNlxYGeLh+wyBpI=';
/** Issued before #18 to a Latin-1 name: the payload's bytes are Latin-1. */
const ISSUED_LATIN1 =
  'eyJjb2RlIjoiQUIyM0MiLCJwYXJ0eUlkIjoicGFydHktMSIsImd1ZXN0TmFtZSI6Ilpv6yDR+vFleiIsImV4cGlyZXNBdCI6IjIwMjYtMTEtMTVUMDU6MDA6MDAuMDAwWiJ9.D2Zybkp0KC8MmCuZeT2U71jtZJof+SWrpowsPungXtw=';

describe('signing a ticket', () => {
  it('writes an ASCII ticket exactly as it always has', async () => {
    const key = await importKey(jwk);
    expect(await signWithKey(key, payloadFor('Giulia Bianchi'))).toBe(
      ISSUED_ASCII,
    );
  });

  it('signs a name outside Latin-1, which used to throw (#18)', async () => {
    const key = await importKey(jwk);
    for (const name of ['Łukasz Wójcik', '王小明', 'Ana 🎉']) {
      const signed = await signWithKey(key, payloadFor(name));
      expect(await verifyWithKey(key, signed)).toEqual({
        ok: true,
        payload: payloadFor(name),
      });
      expect(parseSignedTicket(signed)?.payload.guestName).toBe(name);
    }
  });
});

describe('verifying a ticket', () => {
  it('still accepts the tickets guests already hold', async () => {
    const key = await importKey(jwk);
    expect(await verifyWithKey(key, ISSUED_ASCII)).toEqual({
      ok: true,
      payload: payloadFor('Giulia Bianchi'),
    });
    expect(await verifyWithKey(key, ISSUED_LATIN1)).toEqual({
      ok: true,
      payload: payloadFor('Zoë Ñúñez'),
    });
  });

  it('refuses a ticket signed with another key', async () => {
    const other = await importKey({ ...jwk, k: 'b3RoZXIta2V5LW90aGVyLWtleQ' });
    expect(await verifyWithKey(other, ISSUED_ASCII)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('refuses a ticket whose payload was edited', async () => {
    const key = await importKey(jwk);
    const [, signature] = ISSUED_ASCII.split('.');
    const forged = `${btoa(JSON.stringify(payloadFor('Someone Else')))}.${signature}`;
    expect(await verifyWithKey(key, forged)).toEqual({
      ok: false,
      reason: 'bad_signature',
    });
  });

  it('calls anything not shaped like a ticket malformed', async () => {
    const key = await importKey(jwk);
    for (const value of ['', 'hello', 'a.b.c', `${btoa('{}')}.${btoa('x')}`]) {
      expect(await verifyWithKey(key, value)).toEqual({
        ok: false,
        reason: 'malformed',
      });
    }
  });
});
