-- Cover photos and the budget that keeps R2 inside its free tier (ADR 0007).
--
-- R2 has no spending cap of its own, so the Worker keeps one. `cover_photos`
-- is the ledger of what is stored: one row per party with a photo, so the
-- total stored is a SUM rather than an R2 listing (which R2 bills as a write).
-- A row is written before its object and removed after it, so the ledger may
-- over-count for a moment but never under-counts.

CREATE TABLE cover_photos (
  party_id  TEXT PRIMARY KEY REFERENCES parties(id) ON DELETE CASCADE,
  token     TEXT NOT NULL,
  bytes     INTEGER NOT NULL,
  stored_at TEXT NOT NULL
);

-- Operations spent per UTC day, by kind: 'write' (R2 Class A) and 'read'
-- (Class B). Daily rather than monthly because Cloudflare bills from the
-- account's billing date, not the calendar month: a monthly counter could let
-- two full months land in one bill, a daily one times 31 cannot.
CREATE TABLE r2_usage (
  day   TEXT NOT NULL,
  kind  TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, kind)
);
