import type { GuestContact } from '../../../shared/contact';
import type {
  HostInviteDTO,
  InviteAnswer,
  InviteOpenDTO,
  InviteStatus,
} from '../../../shared/invites';
import { mapResult, request, type ApiError, type ApiResult } from './request';

const invitesPath = (partyId: string): string =>
  `/api/parties/${encodeURIComponent(partyId)}/invites`;

const invitePath = (partyId: string, inviteId: string): string =>
  `${invitesPath(partyId)}/${encodeURIComponent(inviteId)}`;

// ── Host-side ───────────────────────────────────────────────────────────────

/** The host overriding a guest's answer — see `PATCH /api/parties/:id/invites/:id`. */
export function setRemoteInviteStatus(
  partyId: string,
  inviteId: string,
  status: InviteStatus,
): Promise<ApiResult<void>> {
  return request(invitePath(partyId, inviteId), {
    method: 'PATCH',
    body: { status },
  });
}

export async function fetchFunnel(
  partyId: string,
): Promise<ApiResult<HostInviteDTO[]>> {
  const result = await request<{ invites?: HostInviteDTO[] } | undefined>(
    invitesPath(partyId),
  );
  return mapResult(result, (body) => body?.invites);
}

/** Adds a guest an organiser typed in, as a real invite the co-organiser sees. */
export function addRemoteGuest(
  partyId: string,
  name: string,
  contact: GuestContact,
): Promise<ApiResult<HostInviteDTO>> {
  return request(invitesPath(partyId), {
    method: 'POST',
    body: { name, ...contact },
  });
}

/** Sets where to send a guest's ticket. Replaces both fields. */
export function setRemoteContact(
  partyId: string,
  inviteId: string,
  contact: GuestContact,
): Promise<ApiResult<HostInviteDTO>> {
  return request(`${invitePath(partyId, inviteId)}/contact`, {
    method: 'PUT',
    body: contact,
  });
}

/** Marks a guest as paid, or not. The server keeps the answer (ADR 0005). */
export function setRemotePaid(
  partyId: string,
  inviteId: string,
  paid: boolean,
): Promise<ApiResult<HostInviteDTO>> {
  return request(`${invitePath(partyId, inviteId)}/paid`, {
    method: paid ? 'POST' : 'DELETE',
  });
}

// ── The door ────────────────────────────────────────────────────────────────

/**
 * Tells the server a guest walked in.
 *
 * The server arbitrates, so this is what makes a second scan on a second phone
 * fail. That refusal carries the time of the first scan — see
 * {@link earlierCheckIn} — which is what the door needs to say rather than a
 * bare refusal.
 */
export function checkInRemote(
  partyId: string,
  inviteId: string,
): Promise<ApiResult<{ checkedInAt: string | null }>> {
  return request(`${invitePath(partyId, inviteId)}/check-in`, {
    method: 'POST',
  });
}

/**
 * When a check-in failed because another phone got there first: the time of
 * that earlier check-in (`null` if the server did not say). `null` for every
 * other failure.
 */
export function earlierCheckIn(error: ApiError): { at: string | null } | null {
  if (error.kind !== 'http' || error.code !== 'already_checked_in') return null;
  const body = error.body as { checkedInAt?: unknown } | null;
  return {
    at: typeof body?.checkedInAt === 'string' ? body.checkedInAt : null,
  };
}

/** Undoes a check-in, for the guest waved through by mistake. */
export function undoCheckInRemote(
  partyId: string,
  inviteId: string,
): Promise<ApiResult<void>> {
  return request(`${invitePath(partyId, inviteId)}/check-in`, {
    method: 'DELETE',
  });
}

// ── Guest-side ──────────────────────────────────────────────────────────────

export function openInvite(
  slug: string,
  args: { referrer: string | null; inviteId: string | null },
): Promise<ApiResult<InviteOpenDTO>> {
  return request(`/invite/${encodeURIComponent(slug)}/open`, {
    method: 'POST',
    body: args,
  });
}

export function answerInvite(
  slug: string,
  args: {
    inviteId: string;
    name: string;
    answer: InviteAnswer;
    email?: string;
    phone?: string;
  },
): Promise<ApiResult<InviteOpenDTO>> {
  return request(`/invite/${encodeURIComponent(slug)}/answer`, {
    method: 'POST',
    body: args,
  });
}
