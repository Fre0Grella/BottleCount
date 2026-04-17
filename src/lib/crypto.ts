import { getKey, setKey } from './db';
import type { TicketQRPayload } from './types';

// The HMAC key is persisted as a JWK (plain JSON), NOT as a CryptoKey object.
// IndexedDB's structured-clone algorithm cannot serialise CryptoKey instances,
// so storing one directly would throw a DataCloneError.  Always call
// crypto.subtle.exportKey("jwk", key) before writing to IndexedDB, and
// crypto.subtle.importKey("jwk", ...) when reading it back.
async function getOrCreateKey(): Promise<CryptoKey> {
  const stored = await getKey<JsonWebKey | null>('hmac_key', null);

  if (stored) {
    return crypto.subtle.importKey(
      'jwk',
      stored,
      { name: 'HMAC', hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
  }

  const key = await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );

  const jwk: JsonWebKey = await crypto.subtle.exportKey('jwk', key);
  await setKey('hmac_key', jwk);
  return key;
}

/**
 * Called after a Google Sync pull — adopts the shared key from the sheet
 * so all devices sign/verify with the same secret.
 * Returns true if the key actually changed (caller should regenerate QR codes).
 */
export async function adoptRemoteKey(jwk: JsonWebKey): Promise<boolean> {
  const local = await getKey<JsonWebKey | null>('hmac_key', null);
  // Compare by the key material ("k" field in HMAC JWK)
  if (local?.k && local.k === jwk.k) return false;
  await setKey('hmac_key', jwk);
  return true;
}

/**
 * Export the current local key as a JWK so it can be pushed to the sheet.
 */
export async function exportLocalKeyJwk(): Promise<JsonWebKey> {
  const key = await getOrCreateKey();
  return crypto.subtle.exportKey('jwk', key);
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
      'HMAC',
      key,
      sig,
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}
