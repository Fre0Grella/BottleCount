# ADR 0004 — Shared doors, and a code you can read out loud

Status: accepted
Date: 2026-09-18
Follows: [ADR 0003](0003-co-organisers.md)

## Context

`doorScannerSync` was the last feature the pricing page sold and the product did
not deliver. Worse than not delivering it: `featuresFor('pro').doorScannerSync`
returned `true`, so a paying user's UI did not gate it. They simply got a
scanner that disagreed with their co-organiser's.

Two separate things were wrong, and the smaller one was the more visible:

- **Check-in never left the device.** `invites.checked_in` existed from
  migration 0002 and nothing ever wrote it. Each phone kept its own tally, so
  the second phone would happily admit someone the first had already scanned.
- **Tickets were signed per device.** The HMAC key was generated into whichever
  browser first issued a ticket, and the ticket was identified by that browser's
  own numbering for the guest. A co-organiser's phone therefore could not verify
  _anything_ the owner's phone had produced. It would not have double-admitted
  people; it would have rejected all of them.

There was also a hole left by ADR 0003 that only shows up here: a guest an
organiser typed in existed solely in the typing browser. The co-organiser never
saw them, and no second phone could check their ticket.

## Decision

### The signing key belongs to the party, and lives in D1

`parties.ticket_key` holds an HMAC-SHA256 key as a JWK, generated **server-side**
the first time a party is stored, and handed to every member in
`SharedPartyDTO`. It is deliberately excluded from the publish upsert's update
set: rotating it on a save would invalidate every ticket already sitting in a
guest's phone.

It is a shared secret among organisers, which is the right scope. Holding it
means being able to mint a ticket — and anyone holding it can already add a
guest through the API, so it grants nothing they did not have. It is never sent
to a guest.

Verification stays **client-side** rather than becoming an API call. Doors are
in basements; once the key is fetched the scanner works with no signal, which is
the property the HMAC was there for in the first place. Check-in is the part
that needs the network, and it degrades gracefully (below).

### Tickets are keyed by a five-character code

`invites.ticket_code`, unique per party, drawn from
`23456789ABCDEFGHJKMNPQRSTVWXYZ` — the same alphabet FantasyWiki uses for league
invitations, with 0/1/I/L/O/U removed because these are read off a phone in the
dark and typed by someone holding a clipboard. Drawn with rejection sampling so
no character is rarer than the others, and retried against the unique index up
to five times, after which a collision is a fault rather than bad luck
(`lib/ticketCodes.ts`, ported from FantasyWiki's `withUniqueInvitationCode`).

The code is what the QR payload carries, so scanning and typing resolve the same
way and the door has one lookup rather than two. A scanner with a dead camera is
not a different code path.

**Manual verification needs the code _and_ the name.** Five characters is short,
and a guest who overhears another's could otherwise walk in on it. Requiring the
name means the person at the door is checking something the code does not carry.
When a code resolves to somebody else, the refusal says so without naming
them — that would hand a stranger a real guest's name.

`normaliseTicketCode` forgives case, spaces and hyphens, and **nothing else**.
An earlier draft folded `O` onto `Q` and `I` onto `J` on the theory that door
staff mistype. But those characters are absent from the alphabet precisely so
the ambiguity cannot arise, so guessing what someone meant can only turn a
correct rejection into the wrong guest being admitted.

### The server arbitrates check-in

`POST /api/parties/:id/invites/:inviteId/check-in`, with `AND checked_in = 0` in
the UPDATE — that clause is what makes the second scan lose when two phones race
the same ticket. A 409 carries the time of the first scan, so the door says
"already scanned at 23:14" rather than a bare refusal.

`mergeFunnel` now takes `used`/`usedAt` **from the server** instead of carrying
the local value forward. That reverses ADR 0003's rule deliberately: a phone
that did not scan someone must still show them as arrived, and a phone that did
must not out-vote an undo made on the other one.

A failed check-in request leaves the local one standing. The guest is through
the door either way; refusing them over a dropped request is the worse mistake,
and the next sync reconciles it.

### A guest typed in is a real invite

`POST /api/parties/:id/invites` creates a confirmed, depth-0 row with
`source = 'manual'`. That is what lets the co-organiser see them and the second
phone check their ticket.

`source` also keeps the funnel honest: "Reached" counts people who opened the
link, and someone typed in never opened anything. Without the column they would
inflate the top of the funnel and make the conversion rate a lie.

## Consequences

- **Every feature the pricing page sells is now delivered.** `doorScannerSync`
  was the last one.
- **Ticket codes changed shape**, from `BC-3-04217` to `6H85S`. Any ticket
  issued before this is not verifiable, since the payload is keyed differently
  and signed with a different key. Nothing is released, so nothing is stranded.
- **A local-only party keeps a device key and a derived code.** There is no
  server to hold one and nobody else to agree with. The code comes from an FNV
  hash of the guest's name so it is stable across reloads, drawn from the same
  alphabet so a guest cannot tell the difference. Two guests of one party could
  in principle collide; with one device on one door, the name settles it.
- **Undo exists**, because the alternative to a wrong check-in being reversible
  is a guest standing outside while two organisers argue.
- **Check-in still needs the network to be shared.** Two phones both offline
  will each admit the same ticket. Making that impossible needs the door to be
  online at least intermittently; the honest position is that the offline
  fallback verifies signatures and counts locally, which is what it did before.
