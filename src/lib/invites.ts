import type {
  HostInviteDTO,
  InviteAnswer,
  InviteOpenDTO,
  InviteStatus,
  PublishedPartyDTO,
  PublishPartyRequest,
} from '../../shared/invites';
import type { Invite, Party } from './types';

// ── Host-side API ───────────────────────────────────────────────────────────

/** What a failed call tells the caller. `null` error means the request worked. */
export interface ApiResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

async function post<T>(path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (res.ok) return { ok: true, value: (await res.json()) as T };
    const parsed = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: parsed.error ?? `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

/** The snapshot guests see. Everything not on this list stays in the browser. */
export function snapshotOf(party: Party): PublishPartyRequest {
  return {
    localId: party.id!,
    name: party.name,
    date: party.date,
    cover: party.cover,
    venue: {
      place: party.venue.place,
      city: party.venue.city,
      time: party.venue.time,
    },
    allowForward: party.allowForward,
    maxCapacity: party.settings.max_capacity,
  };
}

export function publishParty(
  party: Party,
): Promise<ApiResult<PublishedPartyDTO>> {
  return post<PublishedPartyDTO>('/api/parties/publish', snapshotOf(party));
}

export async function unpublishParty(
  localId: number,
): Promise<ApiResult<void>> {
  try {
    const res = await fetch(`/api/parties/${localId}/publish`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok ? { ok: true } : { ok: false, error: `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

/** The host overriding a guest's answer — see `POST /api/parties/:id/invites/:id`. */
export async function setRemoteInviteStatus(
  localId: number,
  remoteId: string,
  status: InviteStatus,
): Promise<ApiResult<void>> {
  try {
    const res = await fetch(
      `/api/parties/${localId}/invites/${encodeURIComponent(remoteId)}`,
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      },
    );
    return res.ok ? { ok: true } : { ok: false, error: `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

export async function fetchFunnel(
  localId: number,
): Promise<ApiResult<HostInviteDTO[]>> {
  try {
    const res = await fetch(`/api/parties/${localId}/invites`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const body = (await res.json()) as { invites: HostInviteDTO[] };
    return { ok: true, value: body.invites };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

// ── Guest-side API ──────────────────────────────────────────────────────────

export function openInvite(
  slug: string,
  args: { referrer: string | null; inviteId: string | null },
): Promise<ApiResult<InviteOpenDTO>> {
  return post<InviteOpenDTO>(`/invite/${encodeURIComponent(slug)}/open`, args);
}

export function answerInvite(
  slug: string,
  args: { inviteId: string; name: string; answer: InviteAnswer },
): Promise<ApiResult<InviteOpenDTO>> {
  return post<InviteOpenDTO>(
    `/invite/${encodeURIComponent(slug)}/answer`,
    args,
  );
}

// ── Merging the funnel into the local party ─────────────────────────────────

/**
 * Folds the server's invites into the party's local list.
 *
 * One list, not two, because every screen already reads `party.invites` — the
 * guest list, the ticket flow, the door scanner, the KPI bar. Splitting
 * link-sourced guests into a parallel array would mean teaching all of them
 * about a second source.
 *
 * Two rules do the work:
 *
 * - Rows are matched by `remoteId`, so a refresh updates a guest in place and
 *   keeps the client-side `id` their avatar colour and list key depend on.
 * - Local-only rows (no `remoteId`) are kept untouched. Those are the guests
 *   the host typed in by hand, which works on every tier and must not be
 *   deleted by a funnel refresh that has never heard of them.
 *
 * Returns a new array; the caller decides when to commit it.
 */
export function mergeFunnel(
  existing: Invite[],
  remote: HostInviteDTO[],
): Invite[] {
  const byRemoteId = new Map(
    existing.filter((i) => i.remoteId).map((i) => [i.remoteId!, i]),
  );
  const localOnly = existing.filter((i) => !i.remoteId);

  let nextId = existing.reduce((max, i) => Math.max(max, i.id), 0);

  const merged = remote.map((row) => {
    const previous = byRemoteId.get(row.id);
    return {
      // Check-in state lives on the host's device (it comes from the door
      // scanner, which the server knows nothing about yet), so it is carried
      // over rather than overwritten with a default.
      used: previous?.used ?? false,
      ...(previous?.usedAt ? { usedAt: previous.usedAt } : {}),
      id: previous?.id ?? ++nextId,
      remoteId: row.id,
      name: row.name ?? '',
      status: row.status,
      depth: row.depth,
      referrer: row.referrer,
      ...(row.forwardToken ? { forwardToken: row.forwardToken } : {}),
      openedAt: row.openedAt,
      ...(row.answeredAt ? { answeredAt: row.answeredAt } : {}),
    } satisfies Invite;
  });

  // Hand-typed guests first: they were there before the link existed, and the
  // server list grows at the end as people open it.
  return [...localOnly, ...merged];
}
