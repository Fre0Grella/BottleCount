/**
 * The tier model, shared verbatim by the Astro frontend and the Hono Worker.
 *
 * It lives outside both `src/` and `backend/` on purpose. A capability that the
 * UI hides but the API still serves is a paywall that leaks, and one the API
 * refuses but the UI offers is a bug report; the only way to keep the two
 * honest is for them to read the same table. Both sides import this file by
 * relative path (see `backend/tsconfig.json` and `tsconfig.json`), the way
 * FantasyWiki shares its `model/` and `dto/` directories.
 */

// ── Tiers ───────────────────────────────────────────────────────────────────

export const TIERS = ['free', 'pro'] as const;

/**
 * `free` is what an anonymous browser gets — no account, no server, everything
 * in IndexedDB. `pro` is the one-time purchase, and is also what every signed-in
 * user of a self-hosted deployment gets (see {@link resolveTier}).
 */
export type Tier = (typeof TIERS)[number];

export function isTier(value: unknown): value is Tier {
  return (
    typeof value === 'string' && (TIERS as readonly string[]).includes(value)
  );
}

// ── Features ────────────────────────────────────────────────────────────────

export const FEATURES = [
  /** Shareable RSVP link — guests add themselves instead of the host typing them in. */
  'inviteLink',
  /** The reached → confirmed funnel and the friends-of-friends spread view. */
  'rsvpFunnel',
  /** A second organiser editing the same party. */
  'coOrganizers',
  /** Parties, guests and tickets stored server-side and readable from any device. */
  'cloudSync',
  /** Several phones on the door sharing one check-in state. */
  'doorScannerSync',
] as const;

export type Feature = (typeof FEATURES)[number];

export type FeatureSet = Readonly<Record<Feature, boolean>>;

/**
 * What each tier may do.
 *
 * Everything not listed here is unconditionally free: the whole planning side
 * (menu, shopping list, costs, break-even), the manual guest list, locally
 * signed QR tickets and a single door scanner. The paid line is drawn at the
 * features that need a server to exist at all — a link someone else can open,
 * a party two people can edit, state shared across devices.
 */
// Frozen, not merely `Readonly`: these objects are handed to Vue's `reactive`
// state and to JSON responses, and `Readonly` is a compile-time promise only.
// Freezing also tells Vue not to deeply proxy them, which is what we want for a
// lookup table that never changes.
const BY_TIER: Readonly<Record<Tier, FeatureSet>> = Object.freeze({
  free: Object.freeze({
    inviteLink: false,
    rsvpFunnel: false,
    coOrganizers: false,
    cloudSync: false,
    doorScannerSync: false,
  }),
  pro: Object.freeze({
    inviteLink: true,
    rsvpFunnel: true,
    coOrganizers: true,
    cloudSync: true,
    doorScannerSync: true,
  }),
});

export function featuresFor(tier: Tier): FeatureSet {
  return BY_TIER[tier];
}

// ── Resolution ──────────────────────────────────────────────────────────────

/** Everything that bears on which tier a caller is actually on. */
export interface TierContext {
  /** The tier stored on the user row, or `null` when nobody is signed in. */
  storedTier: Tier | null;
  /**
   * True when this deployment is somebody's own Worker rather than the hosted
   * one. Comes from the `SELF_HOSTED` var in `wrangler.jsonc`, never from the
   * client.
   */
  selfHosted: boolean;
}

/**
 * The single place a tier is decided.
 *
 * Self-hosting is the third way to get the full product, so a signed-in user of
 * a self-hosted Worker is `pro` regardless of what their row says — the point of
 * self-hosting is that there is nobody to pay. It deliberately does not promote
 * *anonymous* callers: co-organisers and an invite funnel need to know who is
 * who even when the deployment is yours, so a self-hoster still signs in
 * (`/auth/dev` exists so they can do that without registering a Google client).
 */
export function resolveTier({ storedTier, selfHosted }: TierContext): Tier {
  if (storedTier === null) return 'free';
  return selfHosted ? 'pro' : storedTier;
}
