# ADR 0001 — Cloudflare, and three ways to run BottleCount

Status: accepted
Date: 2026-09-18

## Context

BottleCount was built as a static site with no backend at all: Astro and Vue on
GitHub Pages, every byte of user data in IndexedDB, tickets signed with a
locally generated HMAC key. That is a genuinely good product for one person
planning one party, and it is why the app has no sign-in.

It also caps the product. Three of the features the landing page advertises
cannot work without a server, and today two of them are mockups:

- **The invite link.** `ShareModal` builds a `…/i/<slug>-<id>` URL and copies it
  to the clipboard. Nothing serves that URL. It cannot be served from a static
  bundle, because the person opening it is not the person who has the party in
  their IndexedDB.
- **The RSVP funnel and the spread view.** Both count guests who arrived through
  an invite link. With no link, they count a list the host typed in themselves.
- **Co-organisers.** Never started. A second organiser needs to open the same
  party from their own device.

The Google Sheets sync that once backed multi-scanner check-in is gone from the
UI — only two unused helpers in `lib/crypto.ts` and some stale prose in the
README and privacy policy still refer to it. Asking each host to stand up their
own Apps Script was never a good answer to "where does shared state live".

## Decision

Move to Cloudflare — Pages for the frontend, a Hono Worker for the API, D1 for
storage — and sell hosting rather than software, the way n8n does.

Three ways to run it:

|                 | Who signs in           | Where data lives | Paid features                  |
| --------------- | ---------------------- | ---------------- | ------------------------------ |
| **Browser**     | nobody                 | IndexedDB        | locked                         |
| **Hosted**      | Google                 | D1               | unlocked by a one-time payment |
| **Self-hosted** | Google, or `/auth/dev` | your D1          | unlocked, free                 |

### The free tier does not log in

This is the constraint everything else bends around. A free user has no account,
so `GET /api/session` answers anonymous callers with a 200 and a free feature
set rather than a 401, and every failure to reach it — no backend deployed, a
Worker that is down, an offline phone — resolves to the same anonymous session
rather than an error. The planner has to work when the part of it that is meant
to be optional is missing.

### One table decides what is locked

`shared/tiers.ts` is imported by both the Worker and the frontend. A capability
the UI hides but the API still serves is a paywall that leaks; one the API
refuses but the UI offers is a bug report. Both sides reading the same table is
the only version of this that stays honest.

### Self-hosting grants `pro` on sign-in, not on arrival

`SELF_HOSTED=true` promotes every _signed-in_ user to `pro`. It deliberately
does not promote anonymous ones: co-organisers and an invite funnel need to know
who is who even when the server is yours. `/auth/dev` exists so a self-hoster
can sign in without registering a Google OAuth client.

### Payment is modelled, not yet integrated

`licence_keys` rows are minted by hand (`npm run licence:issue`) and redeemed at
`POST /api/licences/redeem`, which flips the user's tier. No checkout provider
is chosen. When one is, its webhook inserts the same rows and nothing else
changes — which is the point of putting the seam here rather than in the gate.

### Same-origin by service binding

Pages Functions under `functions/` forward `/api/*` and `/auth/*` to the Worker
over a service binding. That is an internal dispatch, not a network hop, so the
browser only ever talks to the Pages domain: the `session_token` cookie is
first-party, `SameSite=Lax` suffices, and no CORS preflight stands between a
user and signing in. Pointing the frontend straight at `*.workers.dev` would
make every session cross-site.

The `/auth/*` proxies are three named files rather than one catchall because a
catchall would also swallow `/auth/callback`, which is a static page — producing
a 404 at the last step of every sign-in.

## Consequences

- **Parties are still local for everyone.** This change carries accounts, tiers
  and the gate; it does not move party data. `cloudSync` is therefore declared
  and locked but not yet backed by anything, and the migration that adds the
  `parties` tables is deliberately not in `0001` — D1 migrations are
  append-only, and a shape invented ahead of its first consumer is a shape you
  migrate away from.
- **The invite link still resolves to nothing.** It is now gated behind `pro`
  and built from the real origin instead of a hard-coded `bottlecount.app`, but
  the `/i/` route that serves it lands with the party-data work.
- **GitHub Pages becomes the documentation host** and stops serving the app.
  The same source builds for both; `BUILD_TARGET=docs` sets the root and drops
  the application routes from the output, since every one of them needs the
  Worker (superseded in detail by ADR 0002's consequences).
- **The D1 SQL is not covered by tests.** `@cloudflare/vitest-pool-workers`
  currently peers on Vitest 4 while this project is on 5, so the route tests run
  on plain Vitest against fake repositories. They cover routing, the session
  guard and the tier rules; they cannot catch a mistake in a SQL statement. See
  `backend/vitest.config.ts`.
- **Two deploy targets to keep in step.** The Worker must be deployed before
  Pages on a first run, because the service binding resolves by name.
