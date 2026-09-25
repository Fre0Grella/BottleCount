import { toRaw } from 'vue';
import type {
  CollaboratorInviteDTO,
  CollaboratorPreviewDTO,
  PartyDocument,
  PartyMemberDTO,
  PartyRole,
  PartySummaryDTO,
  PatchPartyResponse,
  SharedPartyDTO,
} from '../../shared/collab';
import { DOCUMENT_FIELDS } from '../../shared/collab';
import type { MergePatch } from '../../shared/patch';
import type { ApiResult } from './invites';
import type { Party } from './types';

async function json<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { credentials: 'include', ...init });
    if (res.ok) {
      const text = await res.text();
      return { ok: true, value: (text ? JSON.parse(text) : undefined) as T };
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

function post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  return json<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

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
}

// ── Parties ─────────────────────────────────────────────────────────────────

export function listParties(): Promise<
  ApiResult<{ parties: PartySummaryDTO[] }>
> {
  return json('/api/parties');
}

export function fetchParty(id: string): Promise<ApiResult<SharedPartyDTO>> {
  return json(`/api/parties/${encodeURIComponent(id)}`);
}

/** Stores a party server-side. Does not open it to guests. */
export function storeParty(party: Party): Promise<ApiResult<SharedPartyDTO>> {
  return post('/api/parties', {
    localId: party.id,
    document: documentOf(party),
  });
}

export function patchParty(
  id: string,
  baseVersion: number,
  patch: MergePatch,
): Promise<ApiResult<PatchPartyResponse>> {
  return json(`/api/parties/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseVersion, patch }),
  });
}

export function deleteRemoteParty(id: string): Promise<ApiResult<void>> {
  return json(`/api/parties/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ── The guest-facing link ───────────────────────────────────────────────────

export function openInviteLink(
  id: string,
): Promise<
  ApiResult<{ slug: string; rootToken: string; publishedAt: string }>
> {
  return post(`/api/parties/${encodeURIComponent(id)}/invite-link`);
}

export function closeInviteLink(id: string): Promise<ApiResult<void>> {
  return json(`/api/parties/${encodeURIComponent(id)}/invite-link`, {
    method: 'DELETE',
  });
}

// ── Co-organisers ───────────────────────────────────────────────────────────

export function listMembers(
  id: string,
): Promise<ApiResult<{ members: PartyMemberDTO[] }>> {
  return json(`/api/parties/${encodeURIComponent(id)}/members`);
}

export function createCollaboratorInvite(
  id: string,
): Promise<ApiResult<CollaboratorInviteDTO>> {
  return post(`/api/parties/${encodeURIComponent(id)}/members/invite`);
}

export function revokeCollaboratorInvites(
  id: string,
): Promise<ApiResult<void>> {
  return json(`/api/parties/${encodeURIComponent(id)}/members/invites`, {
    method: 'DELETE',
  });
}

export function removeMember(
  id: string,
  userId: string,
): Promise<ApiResult<void>> {
  return json(
    `/api/parties/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
}

export function previewCollaboratorInvite(
  token: string,
): Promise<ApiResult<CollaboratorPreviewDTO>> {
  return json(`/api/collaborate/${encodeURIComponent(token)}`);
}

export function acceptCollaboratorInvite(
  token: string,
): Promise<ApiResult<{ partyId: string; role: PartyRole }>> {
  return post(`/api/collaborate/${encodeURIComponent(token)}`);
}
