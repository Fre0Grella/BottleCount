import type { GuestContact } from '../../shared/contact';
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
  contact: GuestContact,
): Promise<ApiResult<HostInviteDTO>> {
  try {
    const res = await fetch(
      `/api/parties/${encodeURIComponent(partyId)}/invites`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, ...contact }),
      },
    );
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true, value: (await res.json()) as HostInviteDTO };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

async function inviteRequest(
  partyId: string,
  inviteId: string,
  path: string,
  init: RequestInit,
): Promise<ApiResult<HostInviteDTO>> {
  try {
    const res = await fetch(
      `/api/parties/${encodeURIComponent(partyId)}/invites/${encodeURIComponent(inviteId)}/${path}`,
      { credentials: 'include', ...init },
    );
    if (res.ok) return { ok: true, value: (await res.json()) as HostInviteDTO };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? `http_${res.status}` };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

/** Sets where to send a guest's ticket. Replaces both fields. */
export function setRemoteContact(
  partyId: string,
  inviteId: string,
  contact: GuestContact,
): Promise<ApiResult<HostInviteDTO>> {
  return inviteRequest(partyId, inviteId, 'contact', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(contact),
  });
}

/** Marks a guest as paid, or not. The server keeps the answer (ADR 0005). */
export function setRemotePaid(
  partyId: string,
  inviteId: string,
  paid: boolean,
): Promise<ApiResult<HostInviteDTO>> {
  return inviteRequest(partyId, inviteId, 'paid', {
    method: paid ? 'POST' : 'DELETE',
  });
}

export function openInvite(
  slug: string,
  args: { referrer: string | null; inviteId: string | null },
): Promise<ApiResult<InviteOpenDTO>> {
  return post<InviteOpenDTO>(`/invite/${encodeURIComponent(slug)}/open`, args);
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
  // Copied, not carried: the store passes its reactive list, and a Vue proxy
  // left inside the new array ends up in the raw party, where structuredClone
  // refuses it and the next save to IndexedDB fails. Every field is a
  // primitive, so a shallow copy is a full one.
  const localOnly = existing.filter((i) => !i.remoteId).map((i) => ({ ...i }));

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
      ...(row.email ? { email: row.email } : {}),
      ...(row.phone ? { phone: row.phone } : {}),
      // Paid is the server's answer too, for the same reason as check-in: a
      // co-organiser who saw the money arrive marked it on their phone.
      ...(row.paidAt ? { paidAt: row.paidAt } : {}),
    } satisfies Invite;
  });

  // Hand-typed guests first: they were there before the link existed, and the
  // server list grows at the end as people open it.
  return [...localOnly, ...merged];
}

/**
 * Whether a merge produced anything worth persisting.
 *
 * Compares only the fields the server owns — a local check-in is not a reason
 * to think the funnel moved. Every one of them has to be here: a field left
 * out is a change another organiser made that never reaches this screen.
 */
export function sameInvites(before: Invite[], after: Invite[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((a, i) => {
    const b = after[i];
    return (
      b !== undefined &&
      a.id === b.id &&
      a.remoteId === b.remoteId &&
      a.name === b.name &&
      a.status === b.status &&
      a.depth === b.depth &&
      a.referrer === b.referrer &&
      a.forwardToken === b.forwardToken &&
      a.email === b.email &&
      a.phone === b.phone &&
      a.paidAt === b.paidAt
    );
  });
}

/**
 * Ties a guest the host typed in to the row the server made for them.
 *
 * On a shared party a hand-typed guest is posted to the server, which answers
 * with the row it stored — id and ticket code included. Until the local row
 * carries that id, {@link mergeFunnel} cannot tell the two are the same person:
 * it keeps the local one as hand-typed and adds the server's beside it.
 *
 * If a refresh landed between the post and its answer, the server's copy is
 * already in the list and the local row is simply dropped.
 */
export function adoptRemoteGuest(
  existing: Invite[],
  localId: number,
  row: HostInviteDTO,
): Invite[] {
  const target = existing.find((i) => i.id === localId);
  if (!target) return existing;

  if (existing.some((i) => i.remoteId === row.id)) {
    return existing.filter((i) => i.id !== localId);
  }

  return existing.map((i) =>
    i.id === localId
      ? {
          ...i,
          remoteId: row.id,
          ticketCode: row.ticketCode,
          source: row.source,
          openedAt: row.openedAt,
          ...(row.email ? { email: row.email } : {}),
          ...(row.phone ? { phone: row.phone } : {}),
        }
      : i,
  );
}
