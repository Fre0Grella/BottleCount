-- How to reach a guest, and whether they have paid.
--
-- On a paid party (a ticket price and a way to pay the host) a guest leaves an
-- email when they confirm, and may leave a phone number. They are what the
-- ticket is sent to once the host marks the guest as paid. Organisers see them;
-- the public invite endpoints never return them, not even to the guest they
-- belong to, because the invite id that identifies a guest is a bearer token.
--
-- They live here rather than in the party document: the document syncs to
-- every organiser's browser and feeds the public card, and a guest's contact
-- details are neither planning data nor anything a link holder should see.
-- Deleting the party deletes them with the invite rows (ON DELETE CASCADE).

-- Lower-cased. NULL when not given, or after the guest declines.
ALTER TABLE invites ADD COLUMN email TEXT;

-- E.164 (`+393331234567`), which is what WhatsApp addresses by.
ALTER TABLE invites ADD COLUMN phone TEXT;

-- When an organiser marked the guest as paid; NULL while unpaid. BottleCount
-- never sees the money (ADR 0005): the organiser checks their own account and
-- sets this by hand.
ALTER TABLE invites ADD COLUMN paid_at TEXT;
