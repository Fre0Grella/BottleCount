# BottleCount backend

A Hono Worker on Cloudflare, backed by D1. It exists to serve the three things a
static bundle cannot: who you are, what you have paid for, and (next) the party
data two people need to share.

See [ADR 0001](../docs/adr/0001-cloudflare-tiers.md) for why any of this exists.

## What it serves

| Route                                     | Auth            | Purpose                                                             |
| ----------------------------------------- | --------------- | ------------------------------------------------------------------- |
| `GET /`                                   | —               | Liveness, and which environment answered                            |
| `GET /auth/google`                        | —               | Google OAuth; sets the `session_token` cookie                       |
| `POST /auth/logout`                       | —               | Clears it (the cookie is httpOnly, so the page cannot)              |
| `POST /auth/dev`                          | —               | Sign in without Google. **404 unless local or self-hosted**         |
| `GET /api/session`                        | optional        | Who the caller is and what they may do                              |
| `POST /api/licences/redeem`               | session         | Turns a licence code into `pro`                                     |
| `POST /api/parties/publish`               | session + `pro` | Publish or refresh a party's invite card                            |
| `DELETE /api/parties/:localId/publish`    | session + `pro` | Turn the link off; deletes its invites                              |
| `GET /api/parties/:localId/invites`       | session + `pro` | The host's RSVP funnel                                              |
| `PATCH /api/parties/:localId/invites/:id` | session + `pro` | Host overriding a guest's answer                                    |
| `POST /invite/:slug/open`                 | —               | A guest opened the link. **Writes** — this is what "reached" counts |
| `POST /invite/:slug/answer`               | —               | A guest's yes or no                                                 |

`/api/session` is the one `/api/*` route served without a session, because the
free tier _is_ a logged-out browser. The exemption is named explicitly in
`app.ts` rather than left to mount order.

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

The `local` environment sets `SELF_HOSTED=true`, so you can sign in without a
Google OAuth client:

```bash
curl -X POST http://localhost:8787/auth/dev \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","name":"You"}' -c cookies.txt

curl http://localhost:8787/api/session -b cookies.txt
```

Run the Astro dev server (`npm run dev` at the repo root) beside it. In
production the Pages Functions proxy puts both on one origin; in development
they are two ports, which is the only reason the CORS middleware is there.

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
guests racing for the last place cannot both take it, whereas the fake does the
check and the write separately. The fakes reproduce the rule, not the atomicity.

Covering that needs `@cloudflare/vitest-pool-workers`, which at the time of
writing peers on Vitest 4 while this project is on 5. When that clears, the
switch is a config change plus a `tests/support/` swap — nothing in the tests
reaches for a binding directly. Until then, exercise the SQL with
`npm run db:init:local` and the dev server.
