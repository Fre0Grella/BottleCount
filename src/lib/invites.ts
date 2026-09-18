import type {
  HostInviteDTO,
  InviteAnswer,
  InviteOpenDTO,
  InviteStatus,
} from '../../shared/invites';
import type { Invite } from './types';

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

/** The host overriding a guest's answer — see `PATCH /api/parties/:id/invites/:id`. */
export async function setRemoteInviteStatus(
  partyId: string,
  inviteId: string,
  status: InviteStatus,
): Promise<ApiResult<void>> {
  try {
    const res = await fetch(
      `/api/parties/${encodeURIComponent(partyId)}/invites/${encodeURIComponent(inviteId)}`,
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
  partyId: string,
): Promise<ApiResult<HostInviteDTO[]>> {
  try {
    const res = await fetch(
      `/api/parties/${encodeURIComponent(partyId)}/invites`,
      {
        credentials: 'include',
        headers: { accept: 'application/json' },
      },
    );
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const body = (await res.json()) as { invites: HostInviteDTO[] };
    return { ok: true, value: body.invites };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

// ── Guest-side API ──────────────────────────────────────────────────────────

/**
 * Tells the server a guest walked in.
 *
 * The server arbitrates, so this is what makes a second scan on a second phone
 * fail. A 409 carries the time of the first scan, which is what the door needs
 * to say rather than a bare refusal.
 */
export async function checkInRemote(
  partyId: string,
  inviteId: string,
): Promise<ApiResult<{ checkedInAt: string | null }>> {
  try {
    const res = await fetch(
      `/api/parties/${encodeURIComponent(partyId)}/invites/${encodeURIComponent(inviteId)}/check-in`,
      { method: 'POST', credentials: 'include' },
    );
    if (res.ok) {
      const body = (await res.json()) as { checkedInAt: string | null };
      return { ok: true, value: body };
    }
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      checkedInAt?: string | null;
    };
    return {
      ok: false,
      error: body.error ?? `http_${res.status}`,
      value: { checkedInAt: body.checkedInAt ?? null },
    };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

/** Undoes a check-in, for the guest waved through by mistake. */
export async function undoCheckInRemote(
  partyId: string,
  inviteId: string,
): Promise<ApiResult<void>> {
  try {
    const res = await fetch(
      `/api/parties/${encodeURIComponent(partyId)}/invites/${encodeURIComponent(inviteId)}/check-in`,
      { method: 'DELETE', credentials: 'include' },
    );
    return res.ok ? { ok: true } : { ok: false, error: `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

/** Adds a guest an organiser typed in, as a real invite the co-organiser sees. */
export async function addRemoteGuest(
  partyId: string,
  name: string,
): Promise<ApiResult<HostInviteDTO>> {
  try {
    const res = await fetch(
      `/api/parties/${encodeURIComponent(partyId)}/invites`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      },
    );
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true, value: (await res.json()) as HostInviteDTO };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

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
 * - Local-only rows (no `remoteId`) are kept untouched. On a *local-only* party
 *   those are all of them. On a shared party a guest typed in by an organiser
 *   is sent to the server and comes back with a `remoteId`, so a row without
 *   one there is only ever a save still in flight.
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
      id: previous?.id ?? ++nextId,
      remoteId: row.id,
      name: row.name ?? '',
      status: row.status,
      depth: row.depth,
      referrer: row.referrer,
      ...(row.forwardToken ? { forwardToken: row.forwardToken } : {}),
      ticketCode: row.ticketCode,
      source: row.source,
      // Check-in is the server's answer now, not this device's. That is the
      // whole point: two phones on the door have to agree, and the one that
      // agrees is the one that arbitrated. A local guess kept here would show
      // a guest as not-yet-arrived on the phone that did not scan them.
      used: row.checkedIn,
      ...(row.checkedInAt ? { usedAt: row.checkedInAt } : {}),
      openedAt: row.openedAt,
      ...(row.answeredAt ? { answeredAt: row.answeredAt } : {}),
    } satisfies Invite;
  });

  // Hand-typed guests first: they were there before the link existed, and the
  // server list grows at the end as people open it.
  return [...localOnly, ...merged];
}
