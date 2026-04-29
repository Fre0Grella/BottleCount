# Copilot instructions for BottleCount

## Build, test, and lint commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm run format:check
npm run format
```

- There is currently **no test runner configured** (`package.json` has no `test` script), so there is no single-test command yet.
- Node version target is **>= 22.12.0**.

## High-level architecture

- BottleCount is a **static Astro site** (`output: 'static'`, base path `/BottleCount/`) with Vue islands.
  - Astro pages provide shell/layout and routing (`src/pages/*.astro`).
  - Main interactive features live in Vue components:
    - `src/components/Calculator.vue` for planning + catalog editing.
    - `src/components/EventManager.vue` for parties, ticket generation, scanner, and sync.
- Core business logic is in `src/lib`:
  - `core.ts`: drink/economics calculation + menu validation.
  - `types.ts`: shared domain types for catalog/settings/tickets and IndexedDB key names.
  - `db.ts`: Dexie schema (`parties`, `tickets`, `userdata`) and typed `getKey/setKey` helpers.
  - `crypto.ts`: HMAC ticket signing/verification, with key persistence as JWK.
  - `google.ts`: optional Google OAuth + Sheets sync (tabs: `parties`, `tickets`, `config`).
- Data flow for calculator/catalog:
  - Defaults come from `src/data/catalog.json` and `src/data/settings.json`.
  - User customizations are overlaid from IndexedDB (`personal_*`, `hidden_*`, `price_overrides`, `settings`).
  - Computed results come from `calculate(settings, catalog)` when `validateMenu` passes.
- Data flow for tickets/scanner:
  - Parties/tickets are persisted in Dexie tables.
  - QR payloads are signed locally (`crypto.ts`) and validated in scanner flow before marking tickets used.
  - Optional multi-device sync pushes/pulls Dexie records to Google Sheets and synchronizes the shared HMAC key.

## Key conventions in this repo

- **Use `import.meta.env.BASE_URL` for internal links/assets** (important for GitHub Pages base path deployment).
- Treat **Beer/Wine as simple 2-level categories** and Spirits as 3-level (category -> spirit -> drink). Keep this aligned with `SIMPLE`/`SIMPLE_CATEGORIES` logic in Vue + `core.ts`.
- Menu percentage structures are normalized to **1.0 sums** (`macro_pct`, spirit `pct`, and drink splits) with tolerance checks in `validateMenu`.
- For persistent user data, always go through `getKey/setKey` and keep values serializable:
  - Do not store `CryptoKey` directly in IndexedDB; store/export as JWK.
  - Strip Vue proxies (`toRaw`) before persisting reactive objects.
- When adding new persisted userdata, update the `UserDataKey` union in `src/lib/types.ts` to keep key usage typed.
- Preserve Dexie migration history in `src/lib/db.ts` when schema changes (do not collapse existing versions).
