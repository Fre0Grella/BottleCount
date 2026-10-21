-- Short ticket links: /t/<ticket_slug> instead of the whole signed ticket in
-- the link's fragment (#41).
--
-- The organiser's browser still signs the ticket (ADR 0004); it now also hands
-- the signed string to the server, which keeps it here and serves it to whoever
-- opens the short link. The slug is therefore a credential: 12 random
-- characters, never derived from anything guessable. It is kept when a ticket
-- is sent again, so a link already in a guest's chat keeps working.
--
-- Both live on the invite row, so they go when it does: deleting the party
-- deletes them (ON DELETE CASCADE).

ALTER TABLE invites ADD COLUMN ticket_slug TEXT;

-- The exact string the QR encodes, `<payload>.<HMAC>`.
ALTER TABLE invites ADD COLUMN ticket_signed TEXT;

-- SQLite cannot add a UNIQUE column, so uniqueness is an index. NULLs do not
-- collide, so invites without a ticket link are unaffected.
CREATE UNIQUE INDEX idx_invites_ticket_slug ON invites(ticket_slug);
