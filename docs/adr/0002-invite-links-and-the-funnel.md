# ADR 0002 — Invite links, and what the funnel counts

Status: accepted
Date: 2026-09-18
Follows: [ADR 0001](0001-cloudflare-tiers.md)

## Context

ADR 0001 built the accounts and the paywall but left the three paid features
locked and empty. This one fills in two of them: the invite link, and the RSVP
funnel that counts what happens to it.

The funnel already existed as a UI — four columns and a spread view — reading a
list the host typed in themselves. Its columns were therefore fiction: "Reached"
counted people the host had entered, and "Maybe" meant "the host has not heard
back", which is not a thing a local array can know.

## Decision

### The server holds the invitation, not the party

Publishing a party stores what an invitation card shows — name, date, venue,
cover, forwarding, capacity — and nothing else. The menu, the shopping list, the
costs and the locks stay in the host's browser.

This is the smallest thing that makes a link work, and it bounds the damage from
a leaked slug to "a stranger learns there is a party". It is also why `parties`
in migration `0002` is not the `Party` type: it is the invitation, and the two
should not be confused when cloud sync arrives.

### A row is created on open, not on answer

`POST /invite/:slug/open` writes. That is the whole reason "Reached" can be a
real number: a row that only appears when somebody answers cannot count the
people who looked and left, and those are exactly the people a host wants to
chase.

It also renames the states. `accepted`/`pending`/`declined` became
`confirmed`/`opened`/`declined`, because `pending` used to mean "the host is
waiting to hear" and now means "they opened the link and stopped". Parties saved
before this are migrated on load (`store.ts`), since a funnel over the old words
counts nothing.

### Depth comes from the referrer, and the host is depth 0

Every invite gets a `forward_token`. The host's link carries the party's
`root_token` and produces depth 0; a guest's own link produces their depth + 1.
An unrecognised token falls back to depth 0 rather than erroring — the usual
cause is a link from a party that has since been unpublished, and that guest
should still be able to RSVP.

A forward token is only handed out once a guest **confirms**. Otherwise someone
who never replied could seed a referral tree.

### Capacity is checked inside the write

`UPDATE … WHERE (SELECT COUNT(*) … ) < ?` rather than a count followed by an
update, because two guests racing for the last place would both read "one left".
Declining is never refused: a full party is still one you can say no to, and
refusing would strand the row at `opened` and overstate the "maybe" column.

### Identity is the URL, plus one id in `localStorage`

Guests have no account — being able to RSVP without signing up is most of what an
invite link is for — so the URL is the only credential, and the handlers return
nothing a link holder should not see: no other guests' names, no owner, no
budget. The browser keeps its `inviteId` so a reload is the same guest rather
than a second one; a private window loses it and is counted again, which
overstates "Reached" slightly and is much better than refusing the RSVP.

The two public endpoints are the only routes on the Worker that write without an
account behind them, so they sit behind a rate limit binding keyed on IP.

### The host can override, and it has to reach the server

Hosts hear from guests off-platform. Without `PATCH /api/parties/:id/invites/:id`
the host's Accept button would be overwritten by the next poll twenty seconds
later — a button that appears to work and then quietly undoes itself. The
override ignores capacity, because the host is the authority on their own door.

### One guest list, not two

`mergeFunnel` folds the server's invites into `party.invites`, matching on
`remoteId` and leaving rows without one alone. Those are the guests the host
typed in by hand, which works on every tier and must survive a refresh that has
never heard of them. Keeping one array means the guest list, the ticket flow, the
door scanner and the KPI bar did not need to learn about a second source.

## Consequences

- **Publishing happens on every share-sheet open**, so a renamed party or moved
  venue reaches guests without a separate "update" button. The slug and root
  token are excluded from the update, or every link already sent would break.
- **Unpublishing deletes the party and its invites.** Guests already merged into
  the host's local list stay there — they are still coming — but they can no
  longer change their answer.
- **`/i/<slug>` needs a Pages Function.** Slugs are minted at runtime, so
  `getStaticPaths` cannot know them; `functions/i/[[slug]].ts` rewrites the whole
  space onto one built page, which reads the slug off the URL. Invite links
  therefore do not work on a static-only host — which is moot, since they are a
  paid feature and that host has no backend.
- **Check-in state is still local.** The server has no idea the door scanner
  exists, so `mergeFunnel` carries `used`/`usedAt` across refreshes rather than
  letting the server blank them. Multi-device scanning (`doorScannerSync`) is
  still declared and locked.
- **The SQL is still untested.** The race conditions these statements are written
  to survive — two confirmations for the last place, two devices republishing —
  are properties of the statements, and the fakes cannot reproduce them. The flow
  was verified by hand against a local D1; covering it properly still needs
  `@cloudflare/vitest-pool-workers` (see `backend/vitest.config.ts`).
