-- Tickets that more than one phone can check.
--
-- Until now a ticket was signed with a key generated in the issuing browser and
-- identified by that browser's own numbering for the guest. Both are private to
-- one device, so a co-organiser's phone could not verify a ticket the owner's
-- phone produced — it would reject every guest, not merely miscount them. And
-- a hand-added guest existed only on the device that typed them in, so the
-- other organiser never saw them at all.

-- The party's ticket-signing key, as a JWK.
--
-- Per party rather than per user: a ticket belongs to a party, and the people
-- who need to verify it are exactly that party's members. Generated server-side
-- the first time a party is stored, so no client decides it.
--
-- It is a shared secret among organisers, which is the right scope — anyone who
-- holds it could mint a ticket, and anyone who holds it could also just add a
-- guest through the API. It grants nothing they did not already have.
ALTER TABLE parties ADD COLUMN ticket_key TEXT;

-- The five characters printed on the ticket and encoded in its QR.
--
-- Unique per party, not globally: two parties may share a code without either
-- being ambiguous, because a ticket names its party. Scanning and typing both
-- resolve through this, so the door has one lookup and not two.
ALTER TABLE invites ADD COLUMN ticket_code TEXT;

CREATE UNIQUE INDEX idx_invites_party_code ON invites(party_id, ticket_code);

-- Where an invite came from.
--
-- "Reached" counts people who opened the link. A guest the host typed in never
-- opened anything, so without this they would inflate the top of the funnel and
-- make the conversion rate a lie. They still need a server row — that is what
-- lets a co-organiser see them and a second phone check their ticket.
ALTER TABLE invites ADD COLUMN source TEXT NOT NULL DEFAULT 'link'
  CHECK (source IN ('link', 'manual'));

-- Check-in, which was previously only ever written in the scanning browser.
-- The columns already existed (0002) and nothing wrote them; from here the
-- server arbitrates, which is what makes "already scanned" true across devices
-- rather than true on one phone.
