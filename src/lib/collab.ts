import { toRaw } from 'vue';
import type { PartyDocument, SharedPartyDTO } from '../../shared/collab';
import { DOCUMENT_FIELDS, normaliseDocument } from '../../shared/collab';
import type { Party, PartyPublication } from './types';

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

/**
 * Copies a document onto a local party, leaving local-only fields alone.
 *
 * Through the same `normaliseDocument` the server reads every stored document
 * with, so a document from before a field existed (`payment`, say) or one a
 * merge patch left partial cannot leave the Plan tab reading and writing fields
 * that are not there.
 */
export function applyDocument(party: Party, document: PartyDocument): void {
  const whole = normaliseDocument(document);
  for (const field of DOCUMENT_FIELDS) {
    // `as never` because TypeScript cannot see that the two index the same key
    // set. That guarantee lives on DOCUMENT_FIELDS, which is checked against
    // PartyDocument where it is declared.
    party[field] = structuredClone(whole[field]) as never;
  }
}

/** What a browser keeps of a stored party, from what the server said of it. */
export function publicationOf(shared: SharedPartyDTO): PartyPublication {
  return {
    remoteId: shared.id,
    features: shared.features,
    version: shared.version,
    slug: shared.publication?.slug ?? null,
    rootToken: shared.publication?.rootToken ?? null,
    ticketKey: shared.ticketKey,
    publishedAt: shared.updatedAt,
  };
}
