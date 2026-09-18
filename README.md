# 🍾 BottleCount

Plan your party like an engineer. Configure drinks, cocktail recipes, and headcount — get a precise shopping list, cost range, break-even point, and a QR-based ticket workflow.

Run it free in your browser with no account, pay once for the hosted version, or deploy it to your own Cloudflare account for nothing. See [Pricing](#how-to-run-it).

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Astro](https://img.shields.io/badge/Astro-5.x-BC52EE?logo=astro&logoColor=white)](https://astro.build/)
[![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Hono](https://img.shields.io/badge/Hono-Workers-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Dexie](https://img.shields.io/badge/Dexie-IndexedDB-F7DF1E?logo=javascript&logoColor=black)](https://dexie.org/)
[![Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/pages/)
[![License: PolyForm NC](https://img.shields.io/badge/License-PolyForm_NC-3db077)](LICENSE)

**App:** https://bottlecount.pages.dev — the product, free and paid tiers alike
**Docs:** https://fre0grella.github.io/BottleCount — documentation only, no app

---

## What It Does

BottleCount helps you plan ticketed parties without spreadsheets or guesswork. You define **who's coming**, **what they're drinking**, **how strong the event should be**, and **what things cost** — the app calculates the shopping list and the economics from your menu structure.

The planning side needs no server and never will: presets ship with the app, your customizations live in the browser, and it works offline. What a server buys you is the part that is inherently shared — a link your guests can open, a party two people can run, and your data on more than one device.

---

## How to run it

|                                  | Browser           | Hosted         | Self-hosted                |
| -------------------------------- | ----------------- | -------------- | -------------------------- |
| **Price**                        | free, forever     | one payment    | free                       |
| **Account**                      | none              | Google sign-in | Google, or a local sign-in |
| **Your data**                    | this browser only | your account   | your Cloudflare account    |
| Menu, shopping list, budget      | ✅                | ✅             | ✅                         |
| Custom ingredients and cocktails | ✅                | ✅             | ✅                         |
| Guest list you type yourself     | ✅                | ✅             | ✅                         |
| Signed QR tickets, one scanner   | ✅                | ✅             | ✅                         |
| Shareable invite link            | —                 | ✅             | ✅                         |
| RSVP funnel and spread view      | —                 | ✅             | ✅                         |
| Co-organisers on one party       | —                 | ✅             | ✅                         |
| Sync across devices              | —                 | ✅             | ✅                         |
| Several phones on the door       | —                 | ✅             | ✅                         |

The free tier is not a trial: no expiry, no account, no card. If planning a party
in one browser is all you need, that is the finished product.

Self-hosting is free because hosting is the thing being sold, not the software.
Run the Worker yourself and there is nothing left to charge for — see
[Self-hosting](#self-hosting).

---

## Features

### 🍸 Drink Menu Engine

The menu is built around three category patterns:

- **Spirits** — 3-level structure: category → spirit → cocktail. Example: Vodka → 40% Vodka Lemon / 60% Vodka Redbull. Mixer quantities are derived automatically from cocktail recipes.
- **Beer** — 2-level structure: category → variety split. No cocktail layer, served as-is.
- **Wine** — 2-level structure like Beer, with percentage split across varieties.

Alcohol intensity presets still map to pure alcohol targets per person: 🌿 Soft · 🍹 Aperitivo · 🎉 Party · 🔥 Hardcore.

### 🛒 Smart Shopping List

- Calculates bottle counts from ABV, bottle volume, recipe ratios, and guest count.
- Supports **min/max price ranges** so you can estimate both best-case and shelf-price spend.
- Scales automatically as headcount or menu percentages change.
- Applies a configurable safety buffer to avoid underbuying.

### 📊 Party Economics

- Real-time revenue, estimated spend, and profit range.
- Break-even calculation based on fixed costs and average variable cost per person.
- Cost breakdowns and KPI-style summaries for fast planning.

### 🗂️ Catalog Management

- Preset ingredients and cocktails ship with the app as static data files.
- Users can extend the catalog with personal ingredients and cocktails stored locally in IndexedDB.
- Supports hiding presets, adding custom recipes, and overriding prices without touching the base catalog.

### 🎟️ Tickets & Validation

- Generate signed QR tickets in the browser.
- Validate tickets locally with HMAC verification and expiry checks.
- Multi-scanner check-in on the hosted and self-hosted tiers, where several
  phones on the door can agree on who has already walked in.

### 📱 Offline-First Planning

- The planner runs entirely client-side and keeps working with no network.
- Browser storage keeps your custom catalog, settings, and tickets on-device.
- Export/import backup flow is recommended for portability and recovery.

---

## Tech Stack

TypeScript everywhere, and a frontend that still runs with the backend switched off.

| Layer          | Technology                                     |
| -------------- | ---------------------------------------------- |
| Language       | TypeScript (strict)                            |
| Frontend       | Astro + Vue 3, built with Vite                 |
| Client storage | Dexie.js on IndexedDB                          |
| Crypto         | Web Crypto API (HMAC-SHA256)                   |
| QR generation  | `qrcode`                                       |
| QR scanning    | `nimiq/qr-scanner`                             |
| API            | Hono on Cloudflare Workers                     |
| Database       | Cloudflare D1                                  |
| Auth           | Google OAuth → HS256 JWT in an httpOnly cookie |
| Frontend host  | Cloudflare Pages (docs on GitHub Pages)        |

### How the pieces fit

```
browser ──▶ Cloudflare Pages ──┬──▶ static Astro build
                               │
                               └──▶ Pages Function (functions/)
                                        │  service binding, same origin
                                        ▼
                                  Hono Worker ──▶ D1
```

`/api/*` and `/auth/*` are forwarded to the Worker over a **service binding**,
not a public URL. That is an internal dispatch, so the browser only ever talks
to one origin: the session cookie is first-party and no CORS preflight sits
between a user and signing in.

Both tiers are served from here. The free tier is not a different deployment —
it is the same app with nobody signed in, which is why `GET /api/session`
answers anonymous callers instead of rejecting them.

If the Worker is unreachable — it is down, or a self-hoster has not wired the
service binding up yet — the app degrades cleanly to the free tier instead of
failing. That is deliberate, and [`src/lib/session.ts`](src/lib/session.ts) is
where it is enforced.

The documentation site on GitHub Pages is a separate build that contains no
application at all; see [Deploying](#deploying).

### One table decides what is locked

[`shared/tiers.ts`](shared/tiers.ts) is imported by both the Worker and the
frontend. A capability the UI hides but the API still serves is a paywall that
leaks; one the API refuses but the UI offers is a bug report. Both sides reading
the same table is the only version of this that stays honest.

---

## How the Calculation Works

BottleCount calculates how much **pure alcohol** your event needs, then distributes it through the configured drink structure.

### Spirits (3-level)

The core formula for each spirit bottle count is:

\[
\text{bottles} = \left\lceil \frac{N \times \text{alcohol target} \times \text{buffer} \times \text{macro\%} \times \text{spirit\%} \times \text{drink\%}}{\text{ABV} \times \text{bottle ml}} \right\rceil
\]

Mixer quantities are derived directly from cocktail recipes — if a drink uses 250 ml of a mixer per serving, the app multiplies that quantity by the total number of servings required.

### Beer & Wine (2-level)

These categories skip the cocktail layer and use the simpler formula:

\[
\text{bottles} = \left\lceil \frac{N \times \text{alcohol target} \times \text{buffer} \times \text{macro\%} \times \text{variety\%}}{\text{ABV} \times \text{bottle ml}} \right\rceil
\]

### Break-even

The break-even guest count is computed as:

\[
N\_{\text{be}} = \left\lceil \frac{\text{fixed costs}}{\text{ticket price} - \text{avg variable cost per person}} \right\rceil
\]

---

## Local Development

```bash
git clone https://github.com/fre0grella/BottleCount
cd BottleCount
npm run install:all
```

**Frontend only** — the free tier, and all you need for anything on the planning
side:

```bash
npm run dev
```

**With the backend**, in a second terminal:

```bash
cp backend/.dev.vars.example backend/.dev.vars   # set JWT_SECRET to anything
npm --prefix backend run db:init:local           # apply migrations to local D1
npm run backend:dev                              # wrangler dev --env local
```

The `local` Worker environment sets `SELF_HOSTED=true`, so you can sign in
without registering a Google OAuth client:

```bash
curl -X POST http://localhost:8787/auth/dev \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com"}' -c cookies.txt
```

Checks, all of which CI runs:

```bash
npm run lint
npm run typecheck     # astro check + backend tsc
npm test              # backend route and tier tests
npm run build
```

---

## Deploying

### Cloudflare (the app)

One-time setup:

```bash
npx wrangler d1 create db                # paste the id into backend/wrangler.jsonc
cd backend
npx wrangler secret put JWT_SECRET --env production
npx wrangler secret put GOOGLE_CLIENT_SECRET --env production
npm run db:migrate:remote
npm run deploy:production                # the Worker must exist before Pages
```

Then create a Pages project named `bottlecount` pointing at this repository, and
add the service binding in `wrangler.toml` (`BACKEND` → `bottlecount-backend`).
Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets and
`.github/workflows/deploy-cloudflare.yml` takes over from there. Without those
secrets the workflow skips rather than failing, so a fork stays green.

Your Google OAuth client's authorised redirect URI is `<FRONTEND_URL>/auth/google`
— the **frontend** origin, because the Pages Function proxies it back to the
Worker.

### GitHub Pages (the documentation)

Push to `main` and `.github/workflows/deploy.yml` runs `npm run build:docs`,
which publishes the landing page, docs, pricing and legal pages under
`/BottleCount/` — and **leaves the application out**. `/app`, `/auth` and `/i`
are deleted from that build, because each needs the Worker and there is none
behind GitHub Pages; a copy of the product that looks real and fails at sign-in
is worse than no copy.

Those five pages are built for both hosts, so each carries a
`<link rel="canonical">` pointing at the Cloudflare copy — that domain is the
product, and it serves these pages as well as the app. Links to the app from
the docs point there too. Both come from one setting, `PUBLIC_APP_ORIGIN`
([`src/lib/links.ts`](src/lib/links.ts)); a separate canonical origin and app
URL would be two settings obliged to name the same host.

The build settings live in the npm script, not the workflow, so this produces
exactly what CI publishes:

```bash
npm run build:docs
```

---

## Self-hosting

Every paid feature is on, and it costs nothing beyond a Cloudflare account —
the free plan is more than enough for a party.

```bash
git clone https://github.com/fre0grella/BottleCount
cd BottleCount && npm run install:all

npx wrangler d1 create db          # paste the id into the `selfhosted` env
cd backend
# in wrangler.jsonc, set env.selfhosted.vars.FRONTEND_URL to your Pages domain
npx wrangler secret put JWT_SECRET --env selfhosted
npm run db:migrate:remote
npx wrangler deploy --env selfhosted
```

Then deploy the frontend to Pages (`npm run build && npx wrangler pages deploy dist`)
and bind `BACKEND` to your Worker.

`SELF_HOSTED=true` promotes every **signed-in** user to the full feature set. It
does not promote anonymous visitors: co-organisers and the invite funnel need to
know who is who even when the server is yours. `POST /auth/dev` lets you sign in
without a Google client if you would rather not register one.

---

## Issuing licences

Until a checkout provider is wired up, fulfilment on the hosted tier is manual:

```bash
npm --prefix backend run licence:issue -- --env production --note "ko-fi #128"
```

It prints a code like `BC-7K2M-QP4X-9DNR` and inserts it into D1. The buyer
redeems it in the app, which flips their tier to `pro`.

---

## Data, Persistence & Privacy

BottleCount stores user data in the browser's IndexedDB through Dexie. Your custom ingredients, cocktails, settings, generated tickets and local app state stay on your device.

On the free tier that is the whole story — there is no account and nothing is uploaded, because there is nowhere to upload it to.

Signing in adds an account record (id, email, name, avatar URL, tier) in D1.

Nothing else is uploaded until you **share a party** — with a co-organiser, or with guests through an invite link. Doing either stores that party's planning document (name, date, venue, menu, settings, check-offs) so the people you shared it with can open it, plus a row per guest who RSVPs. Parties you have not shared stay in your browser and nowhere else, on every tier ([ADR 0001](docs/adr/0001-cloudflare-tiers.md), [ADR 0002](docs/adr/0002-invite-links-and-the-funnel.md), [ADR 0003](docs/adr/0003-co-organisers.md)).

Because browser storage is still local storage, export/import backup tools are an important part of the workflow for portability and recovery.

---

## Architecture decisions

- [ADR 0001 — Cloudflare, and three ways to run BottleCount](docs/adr/0001-cloudflare-tiers.md)
- [ADR 0002 — Invite links, and what the funnel counts](docs/adr/0002-invite-links-and-the-funnel.md)
- [ADR 0003 — Co-organisers, and how two people edit one party](docs/adr/0003-co-organisers.md)

The backend has [its own README](backend/README.md) covering routes, local
setup, deployment and what the tests do and do not cover.

---

## 📄 License

Licensed under [PolyForm Noncommercial 1.0.0](LICENSE) —
free for personal, educational and non-commercial use with attribution.

For commercial licensing, [contact the author on GitHub](https://github.com/Fre0Grella).

---

<div align="center">
  <sub>Made with ❤️ by <a href="https://github.com/Fre0Grella">Fre0Grella</a></sub>
</div>
