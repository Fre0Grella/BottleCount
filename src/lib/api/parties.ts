import type {
  CollaboratorInviteDTO,
  CollaboratorPreviewDTO,
  PartyMemberDTO,
  PartyRole,
  PartySummaryDTO,
  PatchPartyResponse,
  SharedPartyDTO,
} from '../../../shared/collab';
import type { MergePatch } from '../../../shared/patch';
import { documentOf } from '../collab';
import type { Party } from '../types';
import { request, type ApiResult } from './request';

const partyPath = (id: string): string =>
  `/api/parties/${encodeURIComponent(id)}`;

// ── Parties ─────────────────────────────────────────────────────────────────

export function listParties(): Promise<
  ApiResult<{ parties: PartySummaryDTO[] }>
> {
  return request('/api/parties');
}

export function fetchParty(id: string): Promise<ApiResult<SharedPartyDTO>> {
  return request(partyPath(id));
}

/** Stores a party server-side. Does not open it to guests. */
export function storeParty(party: Party): Promise<ApiResult<SharedPartyDTO>> {
  return request('/api/parties', {
    method: 'POST',
    body: { localId: party.id, document: documentOf(party) },
  });
}

export function patchParty(
  id: string,
  baseVersion: number,
  patch: MergePatch,
): Promise<ApiResult<PatchPartyResponse>> {
  return request(partyPath(id), {
    method: 'PATCH',
    body: { baseVersion, patch },
  });
}

export function deleteRemoteParty(id: string): Promise<ApiResult<void>> {
  return request(partyPath(id), { method: 'DELETE' });
}

// ── The cover photo ─────────────────────────────────────────────────────────

/** Uploads a photo the browser has already shrunk; answers its token. */
export function uploadCoverPhoto(
  id: string,
  photo: Blob,
): Promise<ApiResult<{ token: string }>> {
  return request(`${partyPath(id)}/cover`, { method: 'PUT', body: photo });
}

export function deleteCoverPhoto(id: string): Promise<ApiResult<unknown>> {
  return request(`${partyPath(id)}/cover`, { method: 'DELETE' });
}

// ── The guest-facing link ───────────────────────────────────────────────────

export function openInviteLink(
  id: string,
): Promise<
  ApiResult<{ slug: string; rootToken: string; publishedAt: string }>
> {
  return request(`${partyPath(id)}/invite-link`, { method: 'POST' });
}

export function closeInviteLink(id: string): Promise<ApiResult<void>> {
  return request(`${partyPath(id)}/invite-link`, { method: 'DELETE' });
}

// ── Co-organisers ───────────────────────────────────────────────────────────

export function listMembers(
  id: string,
): Promise<ApiResult<{ members: PartyMemberDTO[] }>> {
  return request(`${partyPath(id)}/members`);
}

export function createCollaboratorInvite(
  id: string,
): Promise<ApiResult<CollaboratorInviteDTO>> {
  return request(`${partyPath(id)}/members/invite`, { method: 'POST' });
}

export function revokeCollaboratorInvites(
  id: string,
): Promise<ApiResult<void>> {
  return request(`${partyPath(id)}/members/invites`, { method: 'DELETE' });
}

export function removeMember(
  id: string,
  userId: string,
): Promise<ApiResult<void>> {
  return request(`${partyPath(id)}/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export function previewCollaboratorInvite(
  token: string,
): Promise<ApiResult<CollaboratorPreviewDTO>> {
  return request(`/api/collaborate/${encodeURIComponent(token)}`);
}

export function acceptCollaboratorInvite(
  token: string,
): Promise<ApiResult<{ partyId: string; role: PartyRole }>> {
  return request(`/api/collaborate/${encodeURIComponent(token)}`, {
    method: 'POST',
  });
}
