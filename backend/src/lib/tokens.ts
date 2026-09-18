/**
 * Tokens and slugs for the invite link.
 *
 * Nothing behind an invite URL is authenticated — that is the whole point, a
 * guest has no account — so the URL itself is the secret. These are sized to be
 * unguessable rather than short.
 */

// Base32-ish, no I/O/0/1: these end up in URLs people read aloud and retype.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomString(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/**
 * ~99 bits. Forward tokens identify a guest to anyone holding one, and a
 * guessable one would let a stranger claim someone else's referral tree.
 */
export function newToken(): string {
  return randomString(20);
}

/**
 * A readable slug with a random tail. The readable half is courtesy — the tail
 * is what stops someone enumerating parties, so it does not shrink when the
 * name is long.
 */
export function newSlug(name: string): string {
  const readable =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'party';
  return `${readable}-${randomString(10)}`;
}
