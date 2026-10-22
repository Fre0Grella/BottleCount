import { toRaw } from 'vue';
import type { PartyDocument } from '../../shared/collab';
import { DOCUMENT_FIELDS } from '../../shared/collab';
import { sanitisePaymentDetails } from '../../shared/payments';
import type { Party } from './types';

// ── The document ────────────────────────────────────────────────────────────

/**
 * The shareable half of a local party.
 *
 * Built by picking the fields on the shared list rather than deleting the ones
 * that are not, so a field added to `Party` later stays local until somebody
 * decides it should travel — the safe direction, since the alternative is
 * silently syncing a browser's private bookkeeping.
 *
 * Reads through `toRaw` because every caller passes the store's reactive party,
 * and every object reached through a Vue proxy is itself a proxy — which
 * structuredClone refuses with a DataCloneError.
 */
export function documentOf(party: Party): PartyDocument {
  const raw = toRaw(party);
  const document = {} as Record<string, unknown>;
  for (const field of DOCUMENT_FIELDS) {
    document[field] = structuredClone(raw[field]);
  }
  return document as unknown as PartyDocument;
}

/** Copies a document onto a local party, leaving local-only fields alone. */
export function applyDocument(party: Party, document: PartyDocument): void {
  for (const field of DOCUMENT_FIELDS) {
    // `as never` because TypeScript cannot see that the two index the same key
    // set. That guarantee lives on DOCUMENT_FIELDS, which is checked against
    // PartyDocument where it is declared.
    party[field] = structuredClone(document[field]) as never;
  }
  // A document stored before payments existed has no `payment`, and a merge
  // patch onto one stores only the fields that changed. Either would leave the
  // Plan tab's card reading and writing fields that are not there.
  party.payment = sanitisePaymentDetails(document.payment);
}
