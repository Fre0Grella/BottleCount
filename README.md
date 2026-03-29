# 🍾 BottleCount

Plan your party like an engineer. Configure drinks, cocktail recipes, and headcount — get a precise shopping list, cost range, break-even point, and optional QR-based ticket workflow in a fully static web app.

[![Deploy to GitHub Pages](https://github.com/fre0grella/BottleCount/actions/workflows/deploy.yml/badge.svg)](https://github.com/fre0grella/BottleCount/actions/workflows/deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Astro](https://img.shields.io/badge/Astro-5.x-BC52EE?logo=astro&logoColor=white)](https://astro.build/)
[![Vue](https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Dexie](https://img.shields.io/badge/Dexie-IndexedDB-F7DF1E?logo=javascript&logoColor=black)](https://dexie.org/)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-222222?logo=githubpages&logoColor=white)](https://pages.github.com/)
[![License: PolyForm NC](https://img.shields.io/badge/License-PolyForm_NC-3db077)](LICENSE)

**Live:** https://fre0grella.github.io/BottleCount

---

## What It Does

BottleCount helps you plan ticketed parties without spreadsheets, guesswork, or backend infrastructure. You define **who's coming**, **what they're drinking**, **how strong the event should be**, and **what things cost** — the app calculates the shopping list and the economics from your menu structure.

The current version is designed as a **static, offline-first tool**: presets ship with the app, your customizations live in the browser, and optional ticket validation can sync through your own Google Sheet setup when you need multiple scanners.

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
- Optional multi-scanner validation through a **user-owned Google Sheet + Apps Script** setup.

### 📱 Offline-First UX

- Static site deployable on GitHub Pages, with no owned backend.
- Browser storage keeps your custom catalog, settings, and tickets on-device.
- Export/import backup flow is recommended for portability and recovery.

---

## Tech Stack

BottleCount is a **100% static site** with a TypeScript-first frontend architecture.

| Layer | Technology |
|---|---|
| Language | TypeScript (strict) |
| Framework | Astro + Vue 3 |
| Build | Vite via Astro |
| Client storage | Dexie.js on IndexedDB |
| Crypto | Web Crypto API (HMAC-SHA256) |
| QR generation | `qrcode` |
| QR scanning | `nimiq/qr-scanner` |
| Optional sync | User-owned Google Sheet + Apps Script |
| Deploy | GitHub Pages via `withastro/action` |

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
N_{\text{be}} = \left\lceil \frac{\text{fixed costs}}{\text{ticket price} - \text{avg variable cost per person}} \right\rceil
\]

---

## Local Development

```bash
git clone https://github.com/fre0grella/BottleCount
cd BottleCount
npm install
npm run dev
```

Open the local Astro dev server shown in the terminal.

---

## Deploy to GitHub Pages

1. Push to `main`.
2. In GitHub repo settings, set Pages source to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` deploys the site automatically through `withastro/action`.

---

## Google Sheet Setup

For multi-device ticket validation at the door, each organizer can connect their own Google Sheet rather than relying on a shared backend.

1. Create a Google Sheet with columns `ticketId`, `used`, and `usedAt`.
2. Open **Extensions → Apps Script** and paste `apps-script/validate.gs`.
3. Add a script property named `TOKEN`, then deploy the script as a web app.
4. Paste the Apps Script URL and token into the app's scanner configuration panel.

This keeps the static-site architecture intact while allowing atomic ticket validation across multiple scanners.

---

## Data, Persistence & Privacy

BottleCount stores user data in the browser's IndexedDB through Dexie. That means your custom ingredients, cocktails, settings, generated tickets, and local app state stay on your device unless you explicitly use the optional Google Sheet flow.

Because browser storage is still local storage, export/import backup tools are an important part of the workflow for portability and recovery.

---

## 📄 License

Licensed under [PolyForm Noncommercial 1.0.0](LICENSE) —
free for personal, educational and non-commercial use with attribution.

For commercial licensing, [contact the author on GitHub](https://github.com/Fre0Grella).

---

<div align="center">
  <sub>Made with ❤️ by <a href="https://github.com/Fre0Grella">Fre0Grella</a></sub>
</div>
