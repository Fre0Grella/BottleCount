/**
 * The invite-link contract, shared by the Worker and the frontend.
 *
 * Everything here crosses the network in both directions, so it lives beside
 * `tiers.ts` for the same reason: a field the server renames and the client
 * still reads is a bug that typechecks on both sides independently.
 */

import type { PartyDocument } from './collab';

// ── Status ──────────────────────────────────────────────────────────────────

export const INVITE_STATUSES = ['opened', 'confirmed', 'declined'] as const;

/**
 * Where someone is in the funnel.
 *
 * `opened` is created the moment the link is opened, before any answer — that
 * is what makes "reached" a real number rather than a guess, and what the
 * "maybe" column counts. It is not a pending *invitation*: nobody was invited
 * by name, they followed a link.
 */
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** An answer a guest can give. Opening the link is not an answer. */
export type InviteAnswer = Exclude<InviteStatus, 'opened'>;

export function isInviteAnswer(value: unknown): value is InviteAnswer {
  return value === 'confirmed' || value === 'declined';
}

// ── What a guest sees before answering ──────────────────────────────────────

/**
 * The public face of a party. Deliberately thin: anyone with the link can read
 * this, so it carries what an invitation card would and nothing else — no
 * budget, no shopping list, no guest names, no owner identity.
 */
export interface InvitePartyDTO {
  slug: string;
  name: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  cover: number;
  venue: { place: string; city: string; time: string };
  /** Whether a confirmed guest gets a forward link of their own. */
  allowForward: boolean;
  /** True when a capacity cap is set and confirmed guests have reached it. */
  full: boolean;
}

/** What `POST /invite/:slug/open` answers with. */
export interface InviteOpenDTO {
  party: InvitePartyDTO;
  /** This visitor's row. The client keeps it so a reload is not a second guest. */
  inviteId: string;
  /** Their own forward token — only present once they confirm and if allowed. */
  forwardToken: string | null;
  /** Their current answer, so returning to the link shows what they already said. */
  status: InviteStatus;
  name: string | null;
  depth: number;
}

export interface InviteAnswerRequest {
  inviteId: string;
  name: string;
  answer: InviteAnswer;
}

export interface InviteOpenRequest {
  /** The forward token from `?r=`, when they arrived through another guest. */
  referrer?: string | null;
  /** A row this browser already owns for this party, from a previous visit. */
  inviteId?: string | null;
}

// ── What the host sees ──────────────────────────────────────────────────────

/** One row of the host's funnel. Names are visible here; this endpoint is theirs. */
export interface HostInviteDTO {
  id: string;
  name: string | null;
  status: InviteStatus;
  /**
   * 0 for someone who used the host's own link, +1 for each forward after that
   * — so 1 is a friend of a guest. Matches the "Direct invites" and
   * "Friends-of-friends" tiers the spread card already draws.
   */
  depth: number;
  /** The referrer's display name, or null at depth 0. */
  referrer: string | null;
  forwardToken: string | null;
  openedAt: string;
  answeredAt: string | null;
}

/** What `POST /api/parties/publish` answers with, and what the host stores. */
export interface PublishedPartyDTO {
  id: string;
  slug: string;
  /** The host's own link. Guests who use it land at depth 0. */
  rootToken: string;
  publishedAt: string;
  allowForward: boolean;
}

/**
 * What a host pushes to put a party on the server.
 *
 * The whole planning document, not a summary: a co-organiser needs the menu and
 * the numbers, and the guest-facing card is derived from the same document
 * server-side rather than sent alongside it — two copies of the party's name
 * travelling together is two copies that can disagree.
 */
export interface PublishPartyRequest {
  /** The party's id in the host's browser. Republishing with it updates in place. */
  localId: number;
  document: PartyDocument;
}

// ── Link building ───────────────────────────────────────────────────────────

/**
 * The one place an invite URL is spelled, so the host's share sheet, a guest's
 * forward link and the page that resolves them cannot drift.
 *
 * `base` is the app's base path (`/` on Cloudflare, `/BottleCount/` on GitHub
 * Pages) — leaving it out is how a build under a prefix hands out links that
 * miss the prefix.
 */
export function inviteUrl(
  origin: string,
  base: string,
  slug: string,
  token?: string | null,
): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const url = `${origin}${prefix}i/${slug}`;
  return token ? `${url}?r=${encodeURIComponent(token)}` : url;
}
