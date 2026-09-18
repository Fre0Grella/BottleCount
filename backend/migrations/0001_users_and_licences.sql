-- Accounts and entitlements.
--
-- Party data is deliberately absent. The cloud tier will own parties, guests
-- and tickets (ADR 0001), but until the frontend actually reads them from here
-- their columns would be a guess, and D1 migrations are append-only — a shape
-- invented ahead of its first consumer is a shape you migrate away from. This
-- file covers only what the session endpoint and the licence gate need today.

-- A person. `id` is ours, not the identity provider's, so a user can later gain
-- a second sign-in method without their parties changing owner.
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  picture     TEXT,
  -- 'free' | 'pro'. Mirrors shared/tiers.ts; CHECK keeps a typo in a manual
  -- `wrangler d1 execute` from silently creating a third tier nothing honours.
  tier        TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- One row per (provider, provider account) pair pointing at a user.
CREATE TABLE identities (
  provider          TEXT NOT NULL,
  provider_user_id  TEXT NOT NULL,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        TEXT NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);

CREATE INDEX idx_identities_user ON identities(user_id);

-- A one-time purchase, redeemable once.
--
-- The checkout provider is not chosen yet, so nothing writes these rows
-- automatically — `npm run licence:issue` (or a `wrangler d1 execute`) does.
-- When a provider is picked, its webhook inserts here and the rest of the
-- system is unchanged: redemption already flips the user's tier.
CREATE TABLE licence_keys (
  code         TEXT PRIMARY KEY,
  tier         TEXT NOT NULL DEFAULT 'pro' CHECK (tier IN ('free', 'pro')),
  issued_at    TEXT NOT NULL,
  -- NULL until someone redeems it. "Redeemable once" is enforced by the
  -- conditional UPDATE in licenceRepositoryD1 (`WHERE redeemed_at IS NULL`,
  -- checked against `meta.changes`), never by a read-then-write in the service.
  redeemed_at  TEXT,
  redeemed_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  note         TEXT
);

CREATE INDEX idx_licence_keys_redeemed_by ON licence_keys(redeemed_by);
