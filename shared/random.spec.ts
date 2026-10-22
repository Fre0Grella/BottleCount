import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomString } from './random';

/** Makes the CSPRNG hand out exactly `bytes`, in order, across calls. */
function feed(bytes: number[]): void {
  const queue = [...bytes];
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T>(array: T): T => {
    const view = array as unknown as Uint8Array;
    for (let i = 0; i < view.length; i++) view[i] = queue.shift() ?? 0;
    return array;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('randomString', () => {
  it('maps bytes onto the alphabet', () => {
    feed([0, 1, 2, 3]);
    expect(randomString('abcd', 4)).toBe('abcd');
  });

  it('throws away bytes that would favour the start of the alphabet', () => {
    // 31 characters: 256 = 8 × 31 + 8, so 248..255 would fold onto a..h.
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    feed([248, 255, 30, 249, 0]);
    expect(randomString(alphabet, 2)).toBe('9a');
  });

  it('keeps every byte when the alphabet divides 256', () => {
    feed([255, 32]);
    expect(randomString('0123456789abcdefghjkmnpqrstvwxyz', 2)).toBe('z0');
  });

  it('draws again when a whole batch is rejected', () => {
    // Batches are `length * 2` bytes: the first is all rejects.
    feed([255, 255, 255, 255, 1, 2]);
    expect(randomString('abc', 2)).toBe('bc');
  });

  it('is the length asked for, from the real CSPRNG', () => {
    const s = randomString('xyz', 40);
    expect(s).toMatch(/^[xyz]{40}$/);
  });

  it('refuses an alphabet a byte cannot index', () => {
    expect(() => randomString('', 4)).toThrow(RangeError);
    expect(() => randomString('a'.repeat(257), 4)).toThrow(RangeError);
  });
});
