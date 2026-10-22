import { normaliseDocument } from '../../../shared/collab';
import type { MergePatch } from '../../../shared/patch';
import type { PublishPartyRequest } from '../../../shared/invites';

/**
 * Validation for everything a client sends about a party.
 *
 * The party document is mostly free-form by design — the menu is whatever
 * categories and cocktails the host invented — so `normaliseDocument` gives it
 * the shape the server itself relies on and bounds the strings that end up on a
 * page anyone with an invite link can open. A host is not a threat; a stolen
 * session is.
 */

const MAX_DOCUMENT_BYTES = 256 * 1024;

/** Normalises a document, or null if it is not one. */
export function parseDocument(body: unknown): PublishPartyRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { localId?: unknown; document?: unknown };

  if (typeof b.localId !== 'number' || !Number.isInteger(b.localId))
    return null;
  if (typeof b.document !== 'object' || b.document === null) return null;

  const document = normaliseDocument(b.document);
  if (document.name === '') return null;

  // A menu is user-authored and unbounded in principle. Cap the stored size so
  // one party cannot become a denial-of-service against the row it lives in.
  if (JSON.stringify(document).length > MAX_DOCUMENT_BYTES) return null;

  return { localId: b.localId, document };
}

/**
 * Checks a patch without interpreting it.
 *
 * Its keys are menu categories and cocktail names, so there is no schema to
 * validate against — what matters is that it is a plain object of bounded size
 * with no key that reaches a prototype. Whatever it does to the document's
 * shape, deleting a field included, is undone on the way out: every stored
 * document is read through `normaliseDocument`.
 */
export function parsePatch(
  body: unknown,
): { baseVersion: number; patch: MergePatch } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { baseVersion?: unknown; patch?: unknown };

  if (typeof b.baseVersion !== 'number' || !Number.isFinite(b.baseVersion)) {
    return null;
  }
  if (
    typeof b.patch !== 'object' ||
    b.patch === null ||
    Array.isArray(b.patch)
  ) {
    return null;
  }

  const patch = b.patch as MergePatch;
  if (Object.keys(patch).length === 0) return null;
  if (JSON.stringify(patch).length > MAX_DOCUMENT_BYTES) return null;

  // `__proto__` in a merge patch is how a JSON payload reaches Object.prototype
  // once something spreads the result. SQLite's json_patch does not care, but
  // the client applies the same patch to a live object and would.
  if (hasForbiddenKey(patch)) return null;

  return { baseVersion: b.baseVersion, patch };
}

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

function hasForbiddenKey(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN.has(key)) return true;
    if (hasForbiddenKey(nested)) return true;
  }
  return false;
}
