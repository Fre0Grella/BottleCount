# ADR 0006 — Short ticket links

Status: accepted
Date: 2026-10-21
Follows: [ADR 0004](0004-shared-doors-and-ticket-codes.md), [ADR 0005](0005-bottlecount-never-handles-money.md)

## Context

A ticket link carried the whole ticket in its fragment: the signed QR string
(`<payload>.<HMAC>`) plus the party's name, date and cover —
`/t/#t=eyJjb2RlIjoi…&p=Rooftop&d=…`. That needed no server and kept the guest's
name out of every request, but the links ran to hundreds of characters. Sent by
WhatsApp or email from the organiser's own phone (#38, #40), they looked like
spam, and some chat apps cut them short (#41).

## Decision

**A shared party sends `/t/<slug>`; the server keeps the ticket the link
names.**

- The organiser's browser still signs the ticket with the party's key
  (ADR 0004). It then hands the signed string to
  `PUT /api/parties/:id/invites/:inviteId/ticket`, which stores it on the
  invite row (`ticket_signed`) and answers with the invite's slug
  (`ticket_slug`, migration 0006).
- The ticket page reads the slug off its path and fetches
  `GET /ticket/:slug`: the signed string, byte for byte, and the party's card
  as it is now. The QR it draws is the same one the door has always verified.

**The slug is a credential**, so it is chosen like one:

- 12 random characters from a 32-letter alphabet, about 60 bits, drawn from the
  platform CSPRNG. A URL shortener's four characters could be enumerated, and
  every hit would be a real guest's ticket.
- The ticket endpoint's rate limit is generous (600 a minute per IP). Guests at
  the door share a venue's Wi-Fi or a carrier's address, and a throttled ticket
  page is a guest stuck outside. The slug's entropy is what stops enumeration,
  not the limiter.
- A slug is kept when a ticket is sent again, so a link already in a guest's
  chat keeps working.

**A ticket is served only while it should exist**, with the same rule as
making one (#33): the guest is coming and, on a party guests pay for, marked as
paid. The server refuses to store a ticket that fails it, or one whose code is
another guest's, and `GET /ticket/:slug` answers the same 404 for a link that
was revoked, never existed, or is malformed. Responses are `no-store`.

**The long form stays.** A local-only party has no server, a hand-typed guest
may not have their server row yet, and storing can fail; each of those sends
the fragment link, and every link sent before this change still opens.

## Consequences

- Links are short: `bottlecount-epj.pages.dev/t/k3fq9zpx2m7a`.
- The guest's signed ticket — their name and code — now lives on the server
  with their invite, and is deleted with the party. The privacy page says so.
- **A short link needs the network the first time it is opened.** The page
  keeps what it fetched on the guest's phone, so a ticket opened once opens
  again at the door without signal; "Save ticket image" remains for a guest
  who never opened it with a connection.
- Taking a ticket back now works: un-marking a payment or a guest saying no
  makes the short link stop opening. It does not invalidate a QR the guest
  already saved as an image — the door's offline check is unchanged.
