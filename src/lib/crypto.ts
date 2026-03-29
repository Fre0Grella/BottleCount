import { getKey, setKey } from './db';
import type { TicketQRPayload } from './types';

async function getOrCreateKey(): Promise<CryptoKey> {
  const stored = await getKey<JsonWebKey | null>('hmac_key', null);
  if (stored) {
    return crypto.subtle.importKey(
      'jwk', stored, { name: 'HMAC', hash: 'SHA-256' }, true, ['sign', 'verify'],
    );
  }
  const key = await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' }, true, ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await setKey('hmac_key', jwk);
  return key;
}

export async function signTicket(payload: TicketQRPayload): Promise<string> {
  const key     = await getOrCreateKey();
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const sig     = await crypto.subtle.sign('HMAC', key, encoded);
  const sigB64  = btoa(String.fromCharCode(...new Uint8Array(sig)));
  const payB64  = btoa(JSON.stringify(payload));
  return `${payB64}.${sigB64}`;
}

export async function verifyTicket(qrString: string): Promise<TicketQRPayload | null> {
  const [payB64, sigB64] = qrString.split('.');
  if (!payB64 || !sigB64) return null;
  try {
    const key     = await getOrCreateKey();
    const payload = JSON.parse(atob(payB64)) as TicketQRPayload;
    const sig     = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    const valid   = await crypto.subtle.verify(
      'HMAC', key, sig, new TextEncoder().encode(JSON.stringify(payload)),
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}
