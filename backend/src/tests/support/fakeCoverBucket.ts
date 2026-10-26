import type { CoverBucket } from '../../lib/coverPhotos';

/**
 * An R2 bucket in a Map: just the three calls the cover photos make.
 */
export function fakeCoverBucket(): CoverBucket & {
  keys(): string[];
} {
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();

  return {
    keys: () => [...objects.keys()].sort(),

    async put(key, value, options) {
      const type =
        (options?.httpMetadata as R2HTTPMetadata | undefined)?.contentType ??
        'application/octet-stream';
      objects.set(key, { bytes: new Uint8Array(value as Uint8Array), type });
      return null;
    },

    async get(key: string) {
      const found = objects.get(key);
      if (!found) return null;
      return {
        key,
        body: new Response(found.bytes).body,
        httpMetadata: { contentType: found.type },
      } as unknown as R2ObjectBody;
    },

    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        objects.delete(key);
      }
    },
  } as CoverBucket & { keys(): string[] };
}
