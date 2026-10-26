-- A party's photos get slots: the banner behind its name and the poster on its
-- invite (ADR 0007). The ledger becomes one row per party and slot.
--
-- SQLite cannot change a primary key in place, so the table is rebuilt. Every
-- photo stored so far was shown as the poster, so it carries over as one. The
-- objects in R2 are keyed by token alone (`covers/<partyId>/<token>`), so none
-- of them has to move.

CREATE TABLE party_photos (
  party_id  TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  slot      TEXT NOT NULL,
  token     TEXT NOT NULL,
  bytes     INTEGER NOT NULL,
  stored_at TEXT NOT NULL,
  PRIMARY KEY (party_id, slot)
);

INSERT INTO party_photos (party_id, slot, token, bytes, stored_at)
SELECT party_id, 'poster', token, bytes, stored_at FROM cover_photos;

DROP TABLE cover_photos;
