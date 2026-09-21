-- Co-organisers: the party itself moves to the server.
--
-- ADR 0002 published the invitation card — enough for a guest to RSVP, useless
-- to a second organiser, who needs the menu, the numbers and the shopping list.
-- This adds the rest of the party, and the membership that says who may open it.

-- The planning half of a party, as one JSON document.
--
-- A document rather than a table per level (categories, spirits, cocktails)
-- because that is what it already is everywhere else: the client keeps it in
-- IndexedDB as one object, the calculator reads it whole, and nothing queries
-- inside it. Normalising it would buy queries nobody makes and cost a join per
-- slider.
ALTER TABLE parties ADD COLUMN document TEXT;

-- Whether the guest-facing invite link is open.
--
-- Sharing a party with a co-organiser now stores it server-side, and that must
-- not be the same act as opening it to RSVPs: a party synced so two people can
-- plan it would otherwise quietly accept guests through a slug its owner has
-- never shown anyone. Existing rows were all published *for* the invite link,
-- so they start open.
ALTER TABLE parties ADD COLUMN invites_open INTEGER NOT NULL DEFAULT 1;

-- Bumped on every accepted write. Clients send the version they were working
-- from; the server uses it to decide whether to return the full document
-- (they had fallen behind) or just the new number (they were current).
ALTER TABLE parties ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Who may open a party.
--
-- `parties.owner_id` stays: it is the one role that cannot be transferred or
-- removed here, and several queries key on it. This table is the general
-- answer, and the owner gets a row in it too so that membership has exactly one
-- place to be read from.
CREATE TABLE party_members (
  party_id  TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  added_at  TEXT NOT NULL,
  PRIMARY KEY (party_id, user_id)
);

-- "Which parties can I open?" runs on every sign-in.
CREATE INDEX idx_party_members_user ON party_members(user_id);

-- Every party that already exists belongs to the person who published it.
-- Without this they would lose access to their own parties the moment the
-- membership check starts being enforced.
INSERT INTO party_members (party_id, user_id, role, added_at)
SELECT id, owner_id, 'owner', published_at FROM parties;

-- An outstanding invitation to co-organise.
--
-- A token rather than an email invitation: the person may not have an account
-- yet, and asking a host to know which address their friend signed up with is
-- asking them to guess. The link is the credential, so it is long, single-party
-- and revocable.
CREATE TABLE collaborator_invites (
  token       TEXT PRIMARY KEY,
  party_id    TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  -- Set when the owner turns the link off. The row is kept rather than deleted
  -- so a revoked link stays revoked instead of becoming an unknown token that a
  -- future invite could be issued for again.
  revoked_at  TEXT
);

CREATE INDEX idx_collaborator_invites_party ON collaborator_invites(party_id);
