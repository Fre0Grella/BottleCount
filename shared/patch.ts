/**
 * A JSON merge patch, in the shape of RFC 7386.
 *
 * Co-organisers edit the same party at once, usually different parts of it —
 * one is building the menu while the other works the guest list. Sending the
 * whole party on every change would make that a race: the last writer wins and
 * the other's work disappears with nothing to show it happened.
 *
 * A patch carries only what changed, so edits to different fields merge
 * cleanly and only edits to the *same* field are last-writer-wins, which is
 * what anyone would expect from two people typing into one box.
 *
 * This works because the syncable part of a party has no arrays in it. Menu,
 * locks and check-offs are all keyed records, and the guest list is not in the
 * document at all — it lives in the invites table and comes back through the
 * funnel. Merge patches replace arrays wholesale, so had there been one, two
 * organisers touching the same list would have clobbered each other.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

/** `null` means "delete this key", exactly as in RFC 7386. */
export type MergePatch = JsonRecord;

function isPlainObject(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether two values are the same as far as the patch is concerned.
 *
 * Arrays and primitives compare by value; objects are walked. `JSON.stringify`
 * would be shorter but depends on key order, which would report spurious
 * changes for objects that are equal but were built differently — and every
 * spurious change is a write and a clobbered field.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

/**
 * What changed between two documents.
 *
 * Returns `null` when nothing did, so callers can skip the write rather than
 * sending an empty patch that still bumps a version and wakes every other
 * client up.
 */
export function diff(before: JsonRecord, after: JsonRecord): MergePatch | null {
  const patch: MergePatch = {};

  for (const [key, value] of Object.entries(after)) {
    if (value === undefined) continue;
    const previous = before[key];

    if (isPlainObject(value) && isPlainObject(previous)) {
      const nested = diff(previous, value);
      if (nested !== null) patch[key] = nested;
      continue;
    }

    if (!deepEqual(previous, value)) patch[key] = value;
  }

  // A key that is gone becomes an explicit null — removing a spirit from the
  // menu has to travel, or the other organiser's copy keeps buying it.
  for (const key of Object.keys(before)) {
    if (!(key in after)) patch[key] = null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Applies a patch, returning a new document. Never mutates its input — the
 * server holds one parsed copy per request and the client holds reactive state,
 * and neither wants this reaching in.
 */
export function apply(target: JsonRecord, patch: MergePatch): JsonRecord {
  const result: JsonRecord = { ...target };

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
      continue;
    }

    const existing = result[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = apply(existing, value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

/**
 * Folds a second patch onto a first, so a queue of edits collapses into one
 * write. Used when a client has pending changes it has not managed to send yet:
 * three nudges of the same slider should reach the server once.
 */
export function squash(first: MergePatch, second: MergePatch): MergePatch {
  const result: MergePatch = { ...first };

  for (const [key, value] of Object.entries(second)) {
    const existing = result[key];
    // A later delete wins outright; a later object merges into an earlier one,
    // but not into an earlier `null` — that would resurrect half a deleted
    // subtree.
    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = squash(existing, value);
      continue;
    }
    result[key] = value;
  }

  return result;
}
