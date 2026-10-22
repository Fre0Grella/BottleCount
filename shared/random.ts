/**
 * The one way the app draws a random string: invite tokens and slugs on the
 * Worker, ticket codes on either side, short ticket-link slugs.
 *
 * Every one of them is a credential of some kind, so they come from the
 * platform's CSPRNG — and every character of the alphabet is equally likely.
 * Folding a byte with `%` is not: unless the alphabet's size divides 256, the
 * first `256 % size` characters come up more often than the rest. So a byte at
 * or above the largest multiple of the size that fits is thrown away and
 * redrawn (rejection sampling). Nobody would notice the bias in one token; an
 * even draw is free here and awkward to retrofit.
 */
export function randomString(alphabet: string, length: number): string {
  const size = alphabet.length;
  if (size < 1 || size > 256) {
    throw new RangeError(`alphabet must have 1 to 256 characters, not ${size}`);
  }
  const ceiling = Math.floor(256 / size) * size;

  let out = '';
  while (out.length < length) {
    // A generous batch, so the common case is one trip to the CSPRNG even
    // after a few rejections.
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte >= ceiling) continue;
      out += alphabet[byte % size];
      if (out.length === length) break;
    }
  }
  return out;
}
