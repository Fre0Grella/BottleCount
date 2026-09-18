import type { MergePatch } from './patch';

/**
 * Co-organisers: the contract for a party two people run together.
 *
 * ADR 0001 kept every party in the host's browser and ADR 0002 published only
 * the invitation card. Neither is enough here — a second organiser opens the
 * party on their own device and needs the menu, the numbers and the shopping
 * list, not a poster. This is the shape that travels.
 */

// ── Roles ───────────────────────────────────────────────────────────────────

export const PARTY_ROLES = ['owner', 'editor'] as const;

/**
 * `owner` is whoever created the party. `editor` is a co-organiser: they may
 * change anything about the party itself, and may not delete it, unpublish it,
 * or add and remove people. Those stay with the owner, because they are the
 * actions that take the party away from everybody else.
 */
export type PartyRole = (typeof PARTY_ROLES)[number];

export function isPartyRole(value: unknown): value is PartyRole {
  return (
    typeof value === 'string' &&
    (PARTY_ROLES as readonly string[]).includes(value)
  );
}

// ── The synced document ─────────────────────────────────────────────────────

/**
 * The part of a party that is shared.
 *
 * Everything an organiser plans with, and nothing else. Two deliberate
 * omissions:
 *
 * - **`invites`** — the guest list lives in its own table and arrives through
 *   the funnel. Keeping it out is what leaves this document free of arrays,
 *   which is what lets merge patches work (see `patch.ts`).
 * - **`id`, `createdAt`, `publication`** — each browser's own bookkeeping. A
 *   collaborator's local id for a party is theirs alone and means nothing to
 *   anyone else.
 */
export interface PartyDocument {
  name: string;
  date: string;
  cover: number;
  venue: { place: string; city: string; time: string };
  settings: {
    guests: number;
    ticket_price: number;
    venue_cost: number;
    equipment_cost: number;
    alcohol_ml_per_person: number;
    buffer: number;
    max_capacity: number | null;
  };
  /** `Record<category, { macro_pct, spirits: Record<spirit, …> }>`. */
  menu: Record<string, unknown>;
  locks: Record<string, boolean>;
  checked: Record<string, boolean>;
  allowForward: boolean;
  includeSnacks: boolean;
}

/** The fields of a local `Party` that belong in the shared document. */
export const DOCUMENT_FIELDS = [
  'name',
  'date',
  'cover',
  'venue',
  'settings',
  'menu',
  'locks',
  'checked',
  'allowForward',
  'includeSnacks',
] as const satisfies readonly (keyof PartyDocument)[];

// ── Members ─────────────────────────────────────────────────────────────────

export interface PartyMemberDTO {
  userId: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: PartyRole;
  addedAt: string;
}

// ── What the client reads and writes ────────────────────────────────────────

export interface SharedPartyDTO {
  id: string;
  document: PartyDocument;
  /**
   * Bumped on every accepted write. The client sends the version it was working
   * from so the server can tell it when it has fallen behind — not to reject
   * the write, but so the client knows to pull before assuming it is current.
   */
  version: number;
  role: PartyRole;
  members: PartyMemberDTO[];
  updatedAt: string;
  /** Present once the invite link is on, so a collaborator can share it too. */
  publication: { slug: string; rootToken: string } | null;
}

/** One entry in the list of parties a user can open. */
export interface PartySummaryDTO {
  id: string;
  name: string;
  date: string;
  cover: number;
  role: PartyRole;
  version: number;
  updatedAt: string;
  memberCount: number;
}

export interface PatchPartyRequest {
  /** What the client believes it is patching. Reported back, never enforced. */
  baseVersion: number;
  patch: MergePatch;
}

export interface PatchPartyResponse {
  version: number;
  /**
   * The full document, returned when the client's `baseVersion` was stale — it
   * had not seen somebody else's edit yet. Null when it was current, so the
   * common case costs nothing.
   */
  document: PartyDocument | null;
  updatedAt: string;
}

// ── Inviting a co-organiser ─────────────────────────────────────────────────

export interface CollaboratorInviteDTO {
  token: string;
  createdAt: string;
}

/** What someone sees before they accept, so they know what they are joining. */
export interface CollaboratorPreviewDTO {
  partyName: string;
  date: string;
  cover: number;
  invitedBy: string;
  /** True when this user is already on the party — the link is then a no-op. */
  alreadyMember: boolean;
}

/**
 * Where a co-organiser invite points.
 *
 * Kept beside `inviteUrl` in spirit but separate in fact: a guest invite and a
 * co-organiser invite grant wildly different things, and one function taking a
 * flag to decide which is a function that will eventually hand a guest an
 * editor's link.
 */
export function collaboratorUrl(
  origin: string,
  base: string,
  token: string,
): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${origin}${prefix}join/${encodeURIComponent(token)}`;
}
