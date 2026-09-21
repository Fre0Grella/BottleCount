# ADR 0003 — Co-organisers, and how two people edit one party

Status: accepted
Date: 2026-09-18
Follows: [ADR 0002](0002-invite-links-and-the-funnel.md)

## Context

Co-organisers was the last locked feature, and the only one that could not be
built on what came before. ADR 0001 left every party in its host's browser; ADR
0002 put the _invitation card_ on the server — name, date, venue — which is
enough for a guest to RSVP and useless to a second organiser, who needs the
menu, the budget and the shopping list.

So this is where the party itself moves to D1. That drags in three questions the
earlier increments could avoid: what shape it is stored in, who may open it, and
what happens when two people change it at once.

## Decision

### The party is a document, not a schema

One JSON column, not a table per level. That is already what it is everywhere
else: the client keeps it in IndexedDB as one object, the calculator reads it
whole, and nothing queries inside it. Normalising a menu into categories,
spirits and cocktails would buy queries nobody makes and cost a join per slider.

The card columns (`name`, `date`, `cover`, venue, `allow_forward`,
`max_capacity`) still exist, because the guest-facing page and the party list
want them without parsing JSON. They are **derived on read** — `toParty` prefers
the document, and `listForUser` uses `json_extract` with the column as fallback.
Only one copy is ever believed, so a patch does not have to keep the other in
step and the two cannot drift. An earlier draft did mirror them on write, and it
needed nine `json_patch` evaluations per save to do it.

### Edits travel as merge patches

The obvious design — send the document, last writer wins — loses work silently:
one organiser builds the menu while the other sets the guest count, and whoever
saves second erases the first. Optimistic locking with a version instead turns
that into a rejected write, which is a merge conflict the user has to resolve
over a change that merges perfectly well.

So a save sends only what changed, as an RFC 7386 merge patch
(`shared/patch.ts`). Edits to different fields merge; only edits to the _same_
field are last-writer-wins, which is what anyone expects from two people typing
in one box.

Two things make this work:

- **The document has no arrays.** Menu, locks and check-offs are keyed records,
  and the guest list is deliberately _not_ in the document — it lives in the
  invites table and arrives through the funnel. Merge patches replace arrays
  wholesale, so a guest list in here would have let two organisers clobber each
  other's RSVPs.
- **SQLite's `json_patch` is RFC 7386.** The server applies patches with it, in
  the same statement that reads and writes the document, so two saves landing at
  once cannot both read the same version. The client uses the shared
  implementation for its own bookkeeping. Neither reimplements the other.

`baseVersion` is reported on, not enforced: a client that had fallen behind gets
the merged document back to catch up, rather than an error.

### Membership is the authorisation, and a 404 is the refusal

Every party route is keyed on the server's id, not the owner's local one — a
co-organiser has their own IndexedDB numbering and it means nothing here. A
caller who is not a member gets **404, not 403**, so a party id cannot be probed
for existence.

`owner` may do everything. `editor` may edit the party, read the funnel, and
open the guest link — that is running the party, which is the job. They may not
delete it, close a link the owner opened, or add and remove people: those are
the actions that take the party away from everybody else. An editor who could
invite could add back someone the owner had just removed, which would make
removal meaningless.

### A co-organiser does not pay

The tier check gates **creating** a cloud party, not opening one. The party
belongs to someone who has already paid, and charging both people to run one
party would make the feature useless — you cannot co-organise alone. What a free
co-organiser does not get is parties of their own.

### Storing a party is not opening it to guests

These were one act in ADR 0002, where publishing existed only for the invite
link. Now that sharing with a co-organiser also stores the party, they have to
separate: otherwise a party synced so two people could plan it would quietly
accept RSVPs through a slug its owner never showed anyone. Hence `invites_open`,
and `POST /api/parties/:id/invite-link` as its own step.

## Consequences

- **`cloudSync` is now real**, and the last locked feature is gone. A signed-in
  user's parties follow them to any device they sign in on, because
  `syncPartyList` pulls anything the server has that this browser does not.
- **Check-in state stays local.** The door scanner is client-side and the server
  knows nothing about it, so `used`/`usedAt` are carried across funnel refreshes
  rather than synced. `doorScannerSync` remains declared and unimplemented.
- **A local-only party is still the free tier's whole story.** Nothing is
  uploaded until someone shares a party or opens an invite link.
- **Deleting a shared party deletes it for everyone**, which is why the client
  calls the server before removing it locally — otherwise a co-organiser keeps
  it and it reappears on the next list sync.
- **The document is capped at 256KB.** A menu is user-authored and unbounded in
  principle; without a cap one party could become a denial-of-service against
  the row it lives in.
- **Conflicts on the same field are silent.** Two organisers dragging the same
  slider is last-writer-wins with no warning. That is the right default for a
  shared control, but it means the UI shows _that_ a change is unsaved (the
  header's "Saving…"/"Not saved" chip) and not _whose_ change won.
- **The SQL still carries the concurrency guarantees the fakes cannot test.**
  The fakes reproduce the merge rules through the same shared implementation,
  but do the read and the write separately. The atomicity was verified by hand:
  two simultaneous patches from one base version, both surviving. Proving it
  in CI still needs `@cloudflare/vitest-pool-workers`.
