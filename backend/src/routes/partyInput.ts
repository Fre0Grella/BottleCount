import type { PartyDocument } from '../../../shared/collab';
import type { MergePatch } from '../../../shared/patch';
import type { PublishPartyRequest } from '../../../shared/invites';

/**
 * Validation for everything a client sends about a party.
 *
 * The party document is mostly free-form by design — the menu is whatever
 * categories and cocktails the host invented — so this checks the shape the
 * server itself relies on and bounds the strings that end up on a page anyone
 * with an invite link can open. A host is not a threat; a stolen session is.
 */

const MAX_DOCUMENT_BYTES = 256 * 1024;

function str(value: unknown, max: number, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Normalises a document, or null if it is not one. */
export function parseDocument(body: unknown): PublishPartyRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as { localId?: unknown; document?: unknown };

  if (typeof b.localId !== 'number' || !Number.isInteger(b.localId))
    return null;
  if (typeof b.document !== 'object' || b.document === null) return null;

  const d = b.document as Record<string, unknown>;
  const name = str(d['name'], 80).trim();
  if (name === '') return null;

  const venue = record(d['venue']);
  const settings = record(d['settings']);

  const document: PartyDocument = {
    name,
    date: str(d['date'], 10),
    cover: Math.max(0, Math.min(5, Math.trunc(num(d['cover'], 0)))),
    venue: {
      place: str(venue['place'], 120),
      city: str(venue['city'], 80),
      time: str(venue['time'], 10),
    },
    settings: {
      guests: num(settings['guests'], 0),
      ticket_price: num(settings['ticket_price'], 0),
      venue_cost: num(settings['venue_cost'], 0),
      equipment_cost: num(settings['equipment_cost'], 0),
      alcohol_ml_per_person: num(settings['alcohol_ml_per_person'], 0),
      buffer: num(settings['buffer'], 1),
      max_capacity:
        typeof settings['max_capacity'] === 'number'
          ? Math.max(1, Math.round(settings['max_capacity']))
          : null,
    },
    menu: record(d['menu']),
    locks: record(d['locks']) as Record<string, boolean>,
    checked: record(d['checked']) as Record<string, boolean>,
    allowForward: d['allowForward'] !== false,
    includeSnacks: d['includeSnacks'] !== false,
  };

  // A menu is user-authored and unbounded in principle. Cap the stored size so
  // one party cannot become a denial-of-service against the row it lives in.
  if (JSON.stringify(document).length > MAX_DOCUMENT_BYTES) return null;

  return { localId: b.localId, document };
}

/**
 * Checks a patch without interpreting it.
 *
 * Its keys are menu categories and cocktail names, so there is no schema to
 * validate against — what matters is that it is a plain object of bounded size,
 * and that it cannot reach fields the document does not own.
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
