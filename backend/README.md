# BottleCount backend

A Hono Worker on Cloudflare, backed by D1. It exists to serve the four things a
static bundle cannot: who you are, what you have paid for, the party data two
organisers share, and the one check-in list every phone on the door agrees on.

See [ADR 0001](../docs/adr/0001-cloudflare-tiers.md) for why any of this exists.

## What it serves

| Route                                                | Auth               | Purpose                                                             |
| ---------------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| `GET /`                                              | —                  | Liveness, and which environment answered                            |
| `GET /auth/google`                                   | —                  | Google OAuth; sets the `session_token` cookie                       |
| `POST /auth/logout`                                  | —                  | Clears it (the cookie is httpOnly, so the page cannot)              |
| `POST /auth/dev`                                     | —                  | Sign in without Google. **404 unless local or self-hosted**         |
| `GET /api/session`                                   | optional           | Who the caller is and what they may do                              |
| `POST /api/licences/redeem`                          | session            | Turns a licence code into `pro`                                     |
| `GET /api/parties`                                   | session            | Parties the caller can open, owned or shared                        |
| `POST /api/parties`                                  | session + `pro`    | Store a party, or save it again                                     |
| `GET /api/parties/:id`                               | member             | The full document, members and role                                 |
| `PATCH /api/parties/:id`                             | member             | One organiser's edit, as a merge patch                              |
| `DELETE /api/parties/:id`                            | owner              | Delete it for everyone                                              |
| `POST /api/parties/:id/invite-link`                  | member             | Open the party to RSVPs                                             |
| `DELETE /api/parties/:id/invite-link`                | owner              | Close it                                                            |
| `GET /api/parties/:id/invites`                       | member             | The RSVP funnel                                                     |
| `POST /api/parties/:id/invites`                      | member             | Add a guest by hand (`source: manual`)                              |
| `PATCH /api/parties/:id/invites/:inviteId`           | member             | Override a guest's answer                                           |
| `POST /api/parties/:id/invites/:inviteId/check-in`   | member             | They walked in. 409 if already scanned                              |
| `DELETE /api/parties/:id/invites/:inviteId/check-in` | member             | Undo a check-in                                                     |
| `GET /api/parties/:id/members`                       | member             | Who is on the party                                                 |
| `POST /api/parties/:id/members/invite`               | owner              | Mint a co-organiser link                                            |
| `DELETE /api/parties/:id/members/invites`            | owner              | Revoke outstanding links                                            |
| `DELETE /api/parties/:id/members/:userId`            | owner, or yourself | Remove, or leave                                                    |
| `GET /api/collaborate/:token`                        | session            | What am I being asked to join?                                      |
| `POST /api/collaborate/:token`                       | session            | Join as an editor                                                   |
| `POST /invite/:slug/open`                            | —                  | A guest opened the link. **Writes** — this is what "reached" counts |
| `POST /invite/:slug/answer`                          | —                  | A guest's yes or no                                                 |

`/api/session` is the one `/api/*` route served without a session, because the
free tier _is_ a logged-out browser. The exemption is named explicitly in
`app.ts` rather than left to mount order.

"member" above means a member of that party — and membership _is_ the
authorisation. A caller who is not one gets **404, not 403**, so a party id
cannot be probed for existence. The tier check gates only `POST /api/parties`:
opening and editing a party you were invited to is deliberately free, because it
belongs to someone who has already paid
([ADR 0003](../docs/adr/0003-co-organisers.md)).

`/invite/*` is mounted **outside** `/api/*` entirely. Guests have no account —
being able to RSVP without signing up is most of what an invite link is for — so
the URL is the only credential those handlers have, and they are written knowing
it: they return nothing a link holder should not see. They are also the only
routes that write without an account behind them, so they sit behind a rate
limit binding keyed on IP
([ADR 0002](../docs/adr/0002-invite-links-and-the-funnel.md)).

## Running it locally

```bash
npm install
cp .dev.vars.example .dev.vars   # then set JWT_SECRET to anything
npm run db:init:local            # applies migrations to the local D1
npm run dev                      # wrangler dev --env local
```

The `local` environment behaves like the hosted product: `SELF_HOSTED` is
`"false"`, so a new account is `free` and the paywall is real. `/auth/dev` still
works, because `ENVIRONMENT` is `local`:

```bash
curl -X POST http://localhost:8787/auth/dev \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","name":"You"}' -c cookies.txt

curl -X POST http://localhost:8787/api/licences/redeem \
  -H 'content-type: application/json' \
  -d '{"code":"BC-TEST-TEST-TEST"}' -b cookies.txt

curl http://localhost:8787/api/session -b cookies.txt
```

`BC-TEST-TEST-TEST` is the test licence (`TEST_LICENCE_CODE`, set on `local`
and `preview`). Unlike a minted code it is reusable and never written to
`licence_keys`, and it is refused whenever `ENVIRONMENT` is `production`. Put
`SELF_HOSTED="true"` in `.dev.vars` to see the self-hosted behaviour instead.

Run the Astro dev server (`npm run dev` at the repo root) beside it and open
http://localhost:4321/app. It proxies `/api/*`, `/invite/*` and the `/auth/*`
routes here (see `astro.config.mjs`), so the browser sees one origin, as it
does behind the Pages Functions in production — and signing in from the header
offers the same email sign-in as `/auth/dev`.

## Deploying

First time, per environment:

```bash
npx wrangler d1 create db                 # paste the id into wrangler.jsonc
npx wrangler secret put JWT_SECRET --env production
npx wrangler secret put GOOGLE_CLIENT_SECRET --env production
npm run db:migrate:remote
npm run deploy:production
```

`GOOGLE_CLIENT_ID` and `FRONTEND_URL` are not secrets and live in
`wrangler.jsonc`. The Google OAuth client's authorised redirect URI must be
`<FRONTEND_URL>/auth/google` — the frontend origin, not the Worker's, because
the Pages Function proxies it back here.

Afterwards, pushes to `main` deploy through
`.github/workflows/deploy-cloudflare.yml`.

## Issuing licences

Until a checkout provider is wired up, fulfilment is manual:

```bash
npm run licence:issue -- --env production --note "ko-fi #128"
```

It prints a code such as `BC-7K2M-QP4X-9DNR` and inserts it. The buyer redeems
it in the app. `--print` generates a code and the SQL without touching the
database.

To test the upgrade without minting anything, redeem `BC-TEST-TEST-TEST` on
`local` or `preview` (see above).

## Structure

```
src/
  app.ts               every route, in one place
  composition.ts       which storage target a request uses
  routes/              HTTP only — no SQL, no business rules
  repositories/        interfaces, and the D1 implementations behind them
  tests/               plain Vitest, fake repositories
migrations/            append-only D1 schema
```

The repository interfaces are not ceremony: they are the seam a self-hoster who
would rather run Postgres plugs into, and the reason the route tests can say
what they are about — a tier, a cookie, a guard — without standing up a
database.

## What the tests do and do not cover

They run on plain Vitest against in-memory repositories, so they cover routing,
the `/api/*` guard, tier resolution, the redemption rules, and the whole invite
flow — depth down a referral chain, capacity refusing a confirmation but never a
decline, one row per returning browser, owner isolation.

They cannot catch a mistake in a SQL statement, and two of those rules are
defended _by_ the SQL: the capacity check and the write are one statement, so two
guests racing for the last place cannot both take it, and `json_patch` merges a
co-organiser's edit inside the same statement that reads and writes the
document, so two saves landing at once cannot both read the same version. The
fakes do the check and the write separately: they reproduce the rule, not the
atomicity. Both were verified by hand against a local D1.

Covering that needs `@cloudflare/vitest-pool-workers`, which at the time of
writing peers on Vitest 4 while this project is on 5. When that clears, the
switch is a config change plus a `tests/support/` swap — nothing in the tests
reaches for a binding directly. Until then, exercise the SQL with
`npm run db:init:local` and the dev server.
