# 🍾 BottleCount

Plan your party like an engineer. Calculate shopping lists, generate signed QR tickets, and validate them at the door — fully offline, no server required.

[![Deploy to GitHub Pages](https://github.com/fre0grella/BottleCount/actions/workflows/deploy.yml/badge.svg)](https://github.com/fre0grella/BottleCount/actions/workflows/deploy.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)

**Live:** https://fre0grella.github.io/BottleCount

---

## Architecture

This is a **100% static site** — no backend, no accounts, no server costs.

| Layer | Technology |
|---|---|
| Language | TypeScript (strict) |
| Framework | Astro + Vue 3 |
| Build | Vite (via Astro) |
| Client storage | Dexie.js (IndexedDB) |
| Crypto | Web Crypto API (HMAC-SHA256) |
| QR generation | qrcode |
| QR scanning | nimiq/qr-scanner |
| Cloud sync | User-owned Google Sheet + Apps Script |
| Deploy | GitHub Pages via `withastro/action` |

```
BottleCount/
├── .github/workflows/deploy.yml   ← GH Pages CI
├── public/favicon.svg
├── src/
│   ├── pages/
│   │   ├── index.astro            ← Landing (zero JS)
│   │   ├── docs.astro             ← How-to guide (zero JS)
│   │   ├── calculator.astro       ← Calculator shell
│   │   ├── tickets.astro          ← Ticket creator shell
│   │   └── scanner.astro          ← Door scanner shell
│   ├── components/
│   │   ├── Calculator.vue         ← Settings + menu editor + shopping list
│   │   ├── CatalogManager.vue     ← Ingredient & cocktail CRUD
│   │   ├── TicketCreator.vue      ← Party management + QR generation
│   │   └── Scanner.vue            ← Camera scan + 3-layer validation
│   ├── lib/
│   │   ├── types.ts               ← All shared interfaces
│   │   ├── core.ts                ← calculate() + validateMenu()
│   │   ├── db.ts                  ← Typed Dexie class + helpers
│   │   ├── crypto.ts              ← HMAC sign/verify
│   │   └── sheets.ts              ← Apps Script wrapper
│   ├── data/
│   │   ├── catalog.json           ← Preset ingredients + cocktails
│   │   └── settings.json          ← Default party settings
│   └── styles/global.css
├── apps-script/validate.gs        ← Google Sheets validator source
├── astro.config.mjs
├── tsconfig.json
└── package.json
```

---

## Local development

```bash
git clone https://github.com/fre0grella/BottleCount
cd BottleCount
npm install
npm run dev
```

Open http://localhost:4321/BottleCount

---

## Deploy to GitHub Pages

1. Push to `main` — the workflow in `.github/workflows/deploy.yml` handles everything automatically via `withastro/action`.
2. In your repo Settings → Pages → Source: **GitHub Actions**.
3. After the first successful run, the site is live at `https://fre0grella.github.io/BottleCount`.

---

## Google Sheet setup (multi-scanner validation)

For multi-device ticket validation at the door:

1. **Create a Google Sheet** — columns: `ticketId` (A), `used` (B), `usedAt` (C). Add ticket IDs in column A.
2. **Add Apps Script** — Extensions → Apps Script → paste `apps-script/validate.gs`.
3. **Set secret** — Script Properties → add `TOKEN = your-secret`.  Deploy as web app (Execute as: Me, Anyone can access).
4. **Configure in Scanner** — paste your deployment URL and token into the ⚙️ config panel.

---

## Data & Privacy

All data lives in your browser's IndexedDB. Nothing is sent anywhere unless you configure the optional Google Sheet sync. Use the **Export backup** button in the Catalog page to download a full JSON backup.

---

## License

[GNU Affero General Public License v3.0](LICENSE)
