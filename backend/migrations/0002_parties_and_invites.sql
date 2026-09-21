-- Published parties and the invite funnel.
--
-- This is the first party data the server holds, and it is deliberately only
-- the part an invite link needs: what an invitation card shows, plus who
-- followed it. The host's menu, shopping list, costs and locks stay in their
-- browser — nobody opening a link needs them, and not storing them keeps the
-- blast radius of a leaked slug down to "someone learns about a party".

-- A party the host has chosen to publish. Unpublishing deletes the row, which
-- cascades to its invites: turning the link off means the link stops working.
CREATE TABLE parties (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The party's id in the owner's IndexedDB. Unique per owner so republishing
  -- updates in place instead of littering the table with copies, and so a host
  -- who clears their browser cannot collide with another host's numbering.
  local_id       INTEGER NOT NULL,
  -- What appears in the URL. Unguessable on its own: a readable slug plus
  -- random suffix, because the guest-facing page has no other access control.
  slug           TEXT NOT NULL,
  name           TEXT NOT NULL,
  date           TEXT NOT NULL,
  cover          INTEGER NOT NULL DEFAULT 0,
  venue_place    TEXT NOT NULL DEFAULT '',
  venue_city     TEXT NOT NULL DEFAULT '',
  venue_time     TEXT NOT NULL DEFAULT '',
  allow_forward  INTEGER NOT NULL DEFAULT 1,
  -- NULL when the host set no cap. When set, confirmations stop at it.
  max_capacity   INTEGER,
  -- The host's own link. Guests who use it are depth 0.
  root_token     TEXT NOT NULL,
  published_at   TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_parties_slug ON parties(slug);
CREATE UNIQUE INDEX idx_parties_owner_local ON parties(owner_id, local_id);
CREATE UNIQUE INDEX idx_parties_root_token ON parties(root_token);

-- One row per person who opened the link, created on open rather than on
-- answer. That is the whole point of the funnel: "reached" has to count people
-- who never replied, and a row that only appears on answer cannot.
CREATE TABLE invites (
  id            TEXT PRIMARY KEY,
  party_id      TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  -- NULL until they answer — opening a link tells us nothing about who they are.
  name          TEXT,
  status        TEXT NOT NULL DEFAULT 'opened'
                CHECK (status IN ('opened', 'confirmed', 'declined')),
  -- 0 via the host's link, +1 per forward. The UI's "Direct invites" tier is
  -- depth 0 and "Friends-of-friends" is everything above it.
  depth         INTEGER NOT NULL DEFAULT 0,
  referrer_id   TEXT REFERENCES invites(id) ON DELETE SET NULL,
  -- This guest's own forward link, minted on open so a confirmation can hand it
  -- straight back without a second write.
  forward_token TEXT NOT NULL,
  checked_in    INTEGER NOT NULL DEFAULT 0,
  checked_in_at TEXT,
  opened_at     TEXT NOT NULL,
  answered_at   TEXT
);

CREATE UNIQUE INDEX idx_invites_forward_token ON invites(forward_token);
CREATE INDEX idx_invites_party ON invites(party_id);
-- The confirmed-count query behind the capacity check runs on every open.
CREATE INDEX idx_invites_party_status ON invites(party_id, status);
