# BottleCount Application – Functional Design Overview (for Redesign)

> This document describes the current functional structure of the BottleCount application, derived from the implementation in the `main` branch. It is intended as input for a visual/UX redesign and therefore focuses on pages, views, components, data and user flows, without prescribing style, layout, or visual language.[cite:2][cite:3]

---

## 1. Global Application Structure

### 1.1 Technology and routing

- Static Astro site with Vue islands for the interactive parts of the application (calculator and event manager). Pages live under `src/pages` and are mapped to routes by filename.[cite:3][cite:4]
- Core interactive experiences are:
  - Calculator experience, implemented as Vue component `Calculator.vue` mounted on `/calculator`.[cite:7][cite:12]
  - Event/ticket management experience, implemented as Vue component `EventManager.vue` mounted on `/event`.[cite:8][cite:13]
- Additional static/mostly static pages:
  - Home page `/` implemented in `index.astro`.[cite:4][cite:6]
  - Documentation page `/docs` implemented in `docs.astro`.[cite:4][cite:9]
  - OAuth callback utility page `/oauth-callback` implementing the Google OAuth redirect receive/bridge logic.[cite:4][cite:10]

### 1.2 Shared layout and navigation

- All content pages (home, calculator, event, docs) import a shared global stylesheet `src/styles/global.css` and the `NavBar` component.[cite:6][cite:7]
- Each page sets the `active` prop on `NavBar` to highlight the corresponding section ("home", "calculator", "event", "docs").[cite:6][cite:7][cite:8]
- `NavBar.astro` defines:
  - Brand area linking to the home route.
  - Primary navigation links to: Home `/`, Calculator `/calculator`, Event `/event`, Docs `/docs`.
  - An `active` state computed via comparison between `Astro.props.active` and link keys.
  - A footer navbar for mobile navigation drawer with the same links and active styling.

### 1.3 Core domain concepts

- Catalog:
  - Ingredients with type (spirit, beer, wine, mixer, snack, extra), ABV, volume, min/max price, and unit.[cite:14][cite:15]
  - Cocktails, each with a main spirit, optional category, and a recipe mapping ingredients to quantity and unit.[cite:14][cite:15]
- Settings:
  - Global default settings and per-party settings controlling guests, ticket price, main costs, alcohol per person, buffer, and drink menu composition.[cite:12][cite:15]
- Party and tickets:
  - Party: named event with date, creation timestamp, optional party-specific menu and settings override.[cite:12][cite:13][cite:15]
  - Ticket: guest-specific entry for a party with guest name, expiry datetime, usage status and optional usage timestamp.[cite:13][cite:15]

---

## 2. Page Inventory and High-level Views

### 2.1 Home page (`/` – `index.astro`)

Primary role: marketing/entry page summarizing what BottleCount does and routing users into Calculator and Docs.[cite:6]

Main sections and views:

- Global navigation and shell:
  - `NavBar` at top with "Home" active.
  - Main content wrapped in a container with class `page`.[cite:6]
- Hero section:
  - Application title and logo.
  - Text block describing value proposition: configure drinks, cocktails, guests and obtain a shopping list, profit margin and break-even.[cite:6]
  - Primary navigation actions:
    - "Open Calculator" link to `/calculator`.
    - "How it works" link to `/docs`.[cite:6]
- Feature grid:
  - Six feature cards, each describing a capability:
    - Smart Drink Menu (spirits engine, beer/wine split, ABV-based calculations).
    - Shopping List (auto-calculates bottles, mixers, snacks, with buffer and price ranges).
    - Financial Dashboard (revenue, profit range, cost breakdown, break-even guests).
    - QR Tickets (per-party cryptographically signed QR tickets).[cite:6]
    - Door Scanner (camera-based ticket validation, offline with optional Google Sheets multi-scanner).[cite:6]
    - Offline behaviour (static site, data stored locally, no accounts/servers).[cite:6]

Distinct views/states on this page:

- Default desktop view: navigation, hero, and feature grid visible.
- Mobile view variant: navigation collapses behind hamburger, same hero and feature grid presented within a narrower column; the hamburger toggles a full-width drawer containing the nav links.[cite:11]

### 2.2 Calculator page (`/calculator` – `calculator.astro` + `Calculator.vue`)

Primary role: configuration and calculation of drinks, quantities, and financial metrics for a global default or party-specific menu.[cite:7][cite:12]

Top-level shells and views:

- Astro shell:
  - `NavBar` with "Calculator" active.
  - A main element containing the Vue calculator root.[cite:7]

- Calculator Vue root views:
  - While loading view: a simple text-only loading state shown until IndexedDB data and settings are ready.[cite:12]
  - Main calculator view: card-based layout with top-level party selector, tabbed content area (Settings, Drink Menu, Catalog), KPI summary, shopping list, and a persistent save bar.[cite:12]

Detailed sub-views:

1. Party switcher section (always visible at top of main view)
   - Global vs party context indicator:
     - Button for "Global defaults".
     - One button per existing party, labelled with party name.[cite:12]
   - Behaviour:
     - Clicking a party button changes `selectedPartyId` and triggers re-sync of working settings/menu.
     - When switching to global mode, the settings reference the stored global settings.
     - When switching to a party, settings become a merged view of global defaults and party overrides.[cite:12]
   - Context label below buttons, describing current mode:
     - If global: editing global defaults used as baseline for all parties.
     - If party: editing that party’s own settings and drink menu.[cite:12]

2. Calculator tab bar (local to the calculator, not global navigation)
   - Tabs: "Settings", "Drink Menu", "Catalog".
   - Each tab toggles `activeTab` and switches the visible view while preserving state.
   - Behaviour: when switching party via party switcher, tab is reset to "Settings" unless currently in "Catalog".[cite:12]

3. Settings tab view
   - Settings form card:
     - Editable fields:
       - Guests (integer >= 1).
       - Ticket price in currency.
       - Venue cost.
       - Equipment cost.[cite:12]
     - Alcohol per person control:
       - Slider between 25 and 100 ml of pure alcohol per person, steps of 25.
       - Dynamic label combining numeric value and a name derived from `ALCOHOL_LEVELS` (e.g., low/medium/high).[cite:12]
       - Row of textual level labels mapping names to ml choices.[cite:12]
   - Menu validation card (shown only when there are menu errors):
     - Header warning label ("Menu errors").
     - List of error messages returned by `validateMenu(settings.menu)`.[cite:12]
     - Button that switches active tab to "Drink Menu" for fixing problems.[cite:12]
   - KPI grid (only when `result` is non-null i.e., menu is valid):
     - KPIs derived from `CalculationResult`:
       - Revenue.
       - Spend (min–max range).
       - Fixed costs.
       - Profit range.
       - Break-even guests.[cite:12]
   - Shopping list card (only when `result` is non-null):
     - Header with title and "Export TXT" button.
     - Table-like list of shopping items with columns: name, type badge, quantity & unit, min price, max price.[cite:12]
     - Summary row with total min and total max costs.[cite:12]
   - Export TXT behaviour:
     - Generates a plain-text summary including:
       - Context (global or party name, guests, ticket price, venue & equipment costs).
       - Revenue, profit range, break-even.
       - Tabular shopping list and totals.
       - Generation timestamp.
     - Triggers browser download of a `.txt` file named with current date.[cite:12]

4. Drink Menu tab view
   - Context banner (only when editing a specific party):
     - Indicates that changes are scoped to that party’s drink menu.[cite:12]
   - Category split card:
     - For each category key in `settings.menu` (expected: Spirits, Beer, Wine), numeric input controlling `macro_pct` (category share of total alcohol consumption).
     - Real-time total percentage indicator (sum of macro_pct) with success/alert styling based on closeness to 100 % via `pctOk`.[cite:12]
   - Category-specific composition cards, one per category:
     - High-level header showing category badge (Spirits/Beer/Wine) and share of total based on `macro_pct`.[cite:12]

   - Beer/Wine simple composition view:
     - For categories flagged as simple (Beer or Wine), each spirit/variety entry shows:
       - Name.
       - Percentage within that category (`DrinkEntry.pct`) with numeric input and % label.
       - Remove button to delete variety from menu.
     - Total percentage summary for the category using `spiritsSum` with validity indicator.
     - Add-variety control:
       - Select listing all ingredient names of type `beer` or `wine` from catalog.
       - "Add" button to append a new variety to the category.

   - Spirits advanced composition and cocktails view:
     - For the "Spirits" category, each spirit block shows:
       - Spirit name, remove button, numeric input for share of "Spirits" category.[cite:12]
     - Nested cocktails section per spirit:
       - For each cocktail in `spData.drinks`, display name, numeric percentage input, remove button.
       - Total cocktails percentage per spirit computed via `drinksSum`, with validity indicator.
       - Add-cocktail controls: select listing cocktails from catalog matching `main_spirit`, plus "Add drink" button.[cite:12]
     - A "Spirits total" summary across all spirits.

5. Catalog tab view
   - Catalog sub-tabs:
     - Local state `catSection` toggles between "ingredients" and "cocktails" sections.[cite:12]

   - Ingredients section view:
     - "Add ingredient" toggle button.
     - Ingredient creation form (visible when toggled):
       - Name.
       - Type (spirit, beer, wine, mixer, snack, extra).
       - ABV.
       - Volume ml.
       - Unit.
       - Min price.
       - Max price.[cite:12]
       - "Add ingredient" submit button which validates uniqueness and persists the ingredient as user-defined.
     - Ingredient list:
       - For each ingredient from `catalog.ingredients` (merged core and user-defined, minus hidden):
         - Display name, type badge, ABV percentage, volume ml if present.
         - Delete button.
       - Price editing row:
         - Inputs bound to `priceEdits` for min and max price.
         - "Save" button that persists overrides while enforcing min ≤ max.

   - Cocktails section view:
     - "Add cocktail" toggle button.
     - Cocktail creation form:
       - Name.
       - Category (Spirits).
       - Main spirit (from `spiritIngredients`).
       - Dynamic recipe builder:
         - For each recipe row: ingredient name, quantity, unit, with remove button.
         - Controls to add rows: ingredient selector (`allIngredientNames`), quantity, unit (ml/kg/pcs), "Add" button.
       - "Create cocktail" button with validation requiring unique name and at least one ingredient.
     - Cocktail list:
       - For each cocktail in `catalog.cocktails`:
         - Name, category badge, base spirit label.
         - Recipe chips showing ingredient and quantity/unit.
         - Delete button that hides or removes the cocktail depending on whether it is default or user-defined.[cite:12]

6. Persistent save bar view
   - Visible whenever `saveLabel` is non-null (Settings or Drink Menu tabs).
   - Displays context summary:
     - If there are menu errors on the Drink Menu tab, shows a warning with count of errors.
     - Otherwise, compact description with mode label (global or party name), guests count and ticket price.
   - Save button:
     - Label depends on active tab and mode (save global settings/menu or save specific party’s settings/menu).
     - On click, "global" mode persists `globalSettings` under IndexedDB key `settings`.
     - On party mode, extracts only party-relevant settings and menu from working settings, updates DB `parties` table and local `parties` ref.[cite:12]

### 2.3 Event page (`/event` – `event.astro` + `EventManager.vue`)

Primary role: manage parties, generate guest tickets, print/share them, and validate tickets via camera or manual QR string; optionally sync parties/tickets via Google Sheets.[cite:8][cite:13]

Top-level shells and views:

- Astro shell: `NavBar` with "Event" active and a main element embedding EventManager Vue island.[cite:8]
- EventManager Vue root views:
  - Loading state until IndexedDB and configuration data are loaded.[cite:13]
  - Main event management UI with:
    - Google sync banner.
    - Parties panel with create/list/delete logic.
    - Per-party tabs: Tickets tab and Scanner tab.
    - Tickets views for stats, guest form, ticket list.
    - Scanner views for camera scanning, manual entry, and scan history.
    - Ticket sharing overlay.[cite:13]

Detailed sub-views:

1. Google Sync banner and connection state
   - First-load states:
     - If no stored sync configuration (`google_sync_config` key is null):
       - Shows card encouraging connecting Google to sync across devices, with "Connect Google" button.[cite:13]
     - If configuration exists:
       - Shows status card with label summarizing connection/sync status and actions "Sync now" and "Disconnect".[cite:13]
   - Status label behaviour, computed from `syncStatus`, `lastSyncedAt` and `syncConfig`:
     - "⏳ Connecting…" while initiating OAuth.
     - "⏳ Syncing…" while syncing.
     - "✅ Synced at …" with last sync time when sync succeeded.
     - "❌ …" with error message when sync fails.
     - When idle but connected, prompts to tap "Sync" to refresh; when not connected, label is empty.[cite:13]
   - Connect flow (Connect Google action):
     - Calls `startOAuth()` to open Google OAuth popup.
     - Uses `connectSheet` to create/configure a Google Sheet and obtains a sheet identifier.
     - Persists `google_sync_config` in IndexedDB.
     - Calls `doSync` to perform initial sync.[cite:13]
   - Sync Now flow:
     - If token/config missing, triggers the connect flow.
     - Otherwise, calls `doSync`.
   - Disconnect flow:
     - After confirmation, clears `google_sync_config` and resets status to idle.[cite:13]

   - Internal sync steps in `doSync` (functional perspective):
     - Export local HMAC ticket signing key (JWK), sync with remote via Google to ensure all devices share a common signing key, and adopt remote key locally.[cite:13]
     - Push local parties and tickets to sheet using `pushParties` and `pushTickets`.
     - Pull remote parties and tickets with `pullAll` and reconcile into IndexedDB:
       - New remote parties/tickets inserted locally.
       - If remote marks a ticket as used while local is not used, update local to used and store remote timestamp if available.
     - Refresh in-memory party list and tickets for selected party.
     - Update sync status and `lastSyncedAt` timestamp.[cite:13]

2. Parties panel (left/top column)
   - Section header with label and "+ New party" toggle button.
   - Create party form:
     - Fields:
       - Party name.
       - Date.[cite:13]
     - Drink menu template selector:
       - Option "Default menu" (Beer 20 %, Spirits 60 %, Wine 20 %, populated from default settings menu).
       - Option "From scratch" (empty categories with default macro splits but no spirits or cocktails).
       - Each option rendered as a radio row with emoji, title, and description.[cite:13]
     - "Create party" button.
   - Party row list:
     - For each stored party in `db.parties`:
       - Name and date (or "No date").
       - Row clickable to select party; selected party is highlighted.
       - Delete button to delete party and all its tickets after confirmation.[cite:13]
   - Behaviour on party create/delete/select:
     - Create: stores new party in IndexedDB, updates parties list, selects new party, pushes to Google if connected.[cite:13]
     - Delete: removes party and its tickets from DB and local state; if deleting selected party, clears selection and tickets.
     - Select: sets `selected` and loads that party’s tickets from DB; ensures each has a QR image generated.[cite:13]

3. Per-party tabs (Tickets vs Scanner)
   - Only visible when a party is selected.
   - Two buttons: "🎟 Tickets" and "📷 Scanner"; they toggle `activeTab` and show relevant content while retaining state in both tabs.
   - If no party is selected, show empty state prompting to select or create a party above.[cite:13]

4. Tickets tab view

   Sections:
   - Tickets header:
     - Title with party name.
     - Actions:
       - "Print all" button to open a new window with printable ticket cards for all tickets of selected party.
       - "+ Add guest" toggle button to reveal/hide guest creation form.[cite:13]

   - Stats cards:
     - Three KPIs computed from tickets list:
       - Total tickets (count).
       - Used tickets (count where `used` is true).
       - Expired tickets (count where `expiresAt` is earlier than now).[cite:13]

   - Guest form (visible when toggled):
     - Guest name input; pressing Enter or clicking "Generate ticket" triggers ticket creation.
     - Valid-until input as datetime-local; default set on mount to the end of the next day.[cite:13]
     - Button "Generate ticket" executes addTicket:
       - Validates presence of a guest name.
       - Creates ticket for selected party with `used = false` and expiry datetime.
       - Stores new ticket in IndexedDB and adds to in-memory list.
       - Generates QR image via `ensureQR`.
       - Pushes ticket to Google if connected.[cite:13]

   - Ticket list:
     - When no tickets: show empty state "No tickets yet".
     - Otherwise, for each ticket:
       - QR preview:
         - If QR already generated for this ticket, show PNG image.
         - Else show placeholder while `ensureQR` runs.[cite:13]
       - Text information:
         - Guest name.
         - Valid until date.
         - Badges for status:
           - "✓ Used" if `used` is true.
           - "Expired" if not used but `expiresAt` has passed.
           - "Valid" otherwise.
         - Ticket id indicator.[cite:13]
       - Actions:
         - Share icon/button to open share overlay for this ticket.
         - Delete button to remove ticket from IndexedDB and local lists; clears cached QR image.[cite:13]

   - Print all behaviour:
     - Builds HTML document containing a card for each ticket with party name/date, QR image or placeholder, guest name, validity date and ticket ID.[cite:13]
     - Triggers opening this document in a new window for printing; if popup is blocked, shows alert.

   - Ticket QR generation behaviour (`ensureQR`):
     - If ticket has an id and no existing image in `qrImages`, constructs `TicketQRPayload` from ticket data.
     - Calls `signTicket` to produce signed ticket string using HMAC key.
     - Uses `QRCode` library to render QR code to canvas, with error correction level H.
     - Calls `overlayLogo` to draw app logo in the centre of QR.
     - Caches the QR PNG data URL in `qrImages` keyed by ticket id.[cite:13]

5. Scanner tab view

   Sections:
   - Scanner viewport:
     - Video element used by `qr-scanner` library to show camera feed.[cite:13]
     - Optional overlay result card showing last scan result (OK or error) with icon and message, covering the video for short time.
   - Start/Stop controls:
     - "Start scanning" button when not scanning.
     - "Stop" button while scanning.
     - Start behaviour:
       - Lazy-imports `qr-scanner` library.
       - Instantiates scanner bound to video element with callback that calls `handleScan` with QR data.
       - Starts camera.[cite:13]
     - Stop behaviour:
       - Stops scanner, destroys instance, sets `scanning` false.

   - Manual entry card:
     - Input field for pasting or typing QR string manually.
     - "Validate" button or pressing Enter triggers validation by reusing `handleScan` with string from input.[cite:13]

   - Scan result handling (`handleScan`):
     - Always temporarily stops scanner to process the result.
     - Uses `verifyTicket` on raw QR string to decode and verify signature. If invalid, sets result to error "Forged or invalid ticket" and restarts scanner.[cite:13]
     - If signature valid, checks expiry time and returns error if expired.
     - Looks up ticket in local DB by `ticketId`:
       - If not found, shows error "Unknown ticket — try syncing first" and restarts scanner.
       - If found but already used, shows error with original usage time.
       - If valid and unused:
         - Marks as used in DB and sets `usedAt` to current time.
         - If Google is connected, calls `markTicketUsed` to update remote spreadsheet.
         - Shows success message "Welcome, {guestName}".
         - After a short delay, restarts scanner for next guest.[cite:13]
     - Each scan result updates `scanHistory` with `ok` flag, guestName and time; history is limited to the last 20 items.
     - On success, request device vibration pattern; on failure, longer vibration.

   - Scan history list:
     - If there are history entries, shows a card listing them with status icon, guest name, and time.
     - If history is empty, shows "Start scanning to see results" empty state.[cite:13]

6. Ticket share overlay view
   - Modal overlay that appears when user clicks share on a ticket.
   - Shows:
     - QR preview image.
     - Guest name.
     - Party name.
     - Text hint that a PNG ticket image will be generated.[cite:13]
   - Actions:
     - Primary: "Share via…" button that calls `shareNative`.
       - `shareNative` uses `buildTicketBlob` to render a card-like PNG composition containing party name/date, QR image, guest name, validity date, and ticket id.[cite:13]
       - If the platform `navigator.share` supports file sharing, opens native share sheet; otherwise, it falls back to direct download of the image file.
     - Secondary: "Download as Image" button that builds PNG and downloads it directly without invoking native share.[cite:13]
   - While share is in progress, a "Generating image…" message is displayed and actions are disabled; closing the modal is also disabled until completion.[cite:13]

### 2.4 Docs page (`/docs` – `docs.astro`)

Primary role: explain how calculator, tickets, scanner and Google Sheets multi-scanner setup work.[cite:9]

Views and sections:

- Shell:
  - `NavBar` with "Docs" active.
  - Main container with constrained width.[cite:9]

- Intro view:
  - Title "How it works".
  - Subtitle describing that the page explains planning and door validation.[cite:9]

- Calculator section card:
  - Describes how to set guest count, ticket price, venue costs, and alcohol intensity preset.
  - Explains menu engine levels:
    - Spirits: 3-level (category → spirit → cocktail), with mixers derived from recipes.
    - Beer/Wine: 2-level (category → variety split).[cite:9]

- Tickets section card:
  - Explains creating a party and generating QR tickets for each guest.
  - Clarifies that tickets are HMAC-signed with a key stored only in the browser, making tickets non-forgeable.[cite:9]
  - Mentions sharing channels: print or share via messaging/email as PNG.

- Scanner section card:
  - Explains camera-based QR scanning at the door.
  - Lists validation layers: signature check, expiry check, already-used check.
  - Notes that it works fully offline, and multi-scanner is enabled by Google Sheet integration.[cite:9]

- Google Sheet setup section card:
  - Stepper with 4 steps to configure multi-scanner:
    - Create Google Sheet with columns ticketId, used, usedAt, and one row per ticket.
    - Add Apps Script from `apps-script/validate.gs` in repo.
    - Configure TOKEN script property and deploy as web app.
    - Configure Scanner page with deployment URL and token to enable cross-device validation.[cite:9]

The docs page itself is static; there is no user interaction beyond reading content and following described steps outside the app.[cite:9]

### 2.5 OAuth callback page (`/oauth-callback` – `oauth-callback.astro`)

Primary role: intermediate redirect page for Google OAuth which communicates tokens back to the main app window.[cite:10]

Behaviour and views:

- Simple full-screen message summarizing that the app is connecting to Google and the window will close automatically.[cite:10]
- Inline script:
  - Reads URL hash fragment (`window.location.hash`) and parses `access_token` and `error` parameters.
  - If `window.opener` is present and open, `postMessage`s either a token message (`{ type: 'GOOGLE_OAUTH_TOKEN', token }`) or error message (`{ type: 'GOOGLE_OAUTH_ERROR', error }`) to the opener, restricted to the same origin.
  - Closes the window after a short timeout.[cite:10]

This page has no user interactions beyond being opened by OAuth redirect; it provides user feedback and then closes.

---

## 3. Components and Cross-cutting Functionalities

### 3.1 NavBar component

Responsibilities:

- Provide a consistent primary navigation across all pages.
- Reflect current page via `active` prop.
- Provide mobile-friendly navigation via hamburger menu and slide-down drawer.

Key behaviours:

- Accepts `active` string prop.
- Builds link list with href/label/key entries for Home, Calculator, Event, Docs.[cite:11]
- Renders links in both desktop and mobile contexts, marking them as active when their key matches `active`.
- Exposes DOM elements `nav-hamburger` and `nav-drawer` with click handler toggling `open` class and switching icon from burger to cross.[cite:11]

### 3.2 Calculator core logic (domain layer)

Implemented in `src/lib/core.ts` (not fully quoted here but used by `Calculator.vue`).[cite:14][cite:12]

Responsibilities:

- `validateMenu(menu)`: ensure structural and numerical constraints on menu composition (macro percentages, per-category splits, per-spirit splits, cocktail splits) and produce human-readable error strings.[cite:12][cite:14]
- `calculate(settings, catalog)`: given `Settings` and `Catalog`, compute `CalculationResult` including shopping list, cost ranges, revenue, profit, fixed costs and break-even guests.[cite:12][cite:14]
- Provide `ALCOHOL_LEVELS` mapping from ml-per-person values to descriptive labels used in UI.[cite:12][cite:14]

These functions are pure from the UI’s perspective and are invoked only via `Calculator.vue`’s computed properties.

### 3.3 Persistence and database layer

Implemented in `src/lib/db.ts` and consumed by both `Calculator.vue` and `EventManager.vue`.[cite:14][cite:12][cite:13]

Responsibilities:

- Provide IndexedDB-backed `db` object with:
  - `parties` table storing Party objects.
  - `tickets` table storing Ticket objects.[cite:13][cite:15]
- Provide generic `getKey`/`setKey` helpers to read/write user data objects like:
  - Personal ingredients.
  - Personal cocktails.
  - Hidden ingredients/cocktails flags.
  - Price overrides.
  - Global settings.
  - Google sync configuration.
  - HMAC key material.

### 3.4 Ticket cryptography

Implemented in `src/lib/crypto.ts`.[cite:14][cite:13]

Responsibilities:

- Manage a per-browser HMAC signing key for tickets:
  - Generate and store key under `hmac_key` if missing.
  - Export HMAC key as JWK for syncing across devices.
  - Adopt remote key when syncing from Google.[cite:13][cite:15]
- `signTicket(payload)`: produce compact string encoding of ticket payload with cryptographic signature.
- `verifyTicket(qrString)`: verify signature and decode payload or return null on failure.

### 3.5 Google integration layer

Implemented in `src/lib/google.ts`.[cite:14][cite:13]

Responsibilities from UI perspective:

- OAuth:
  - `startOAuth()`: open Google OAuth flow and resolve with access token, using `/oauth-callback` page as redirect target.
  - `getAccessToken()`: get (cached) access token when needed.[cite:10][cite:13]
- Sheet connection and synchronization:
  - `connectSheet(token)`: create or connect to a Google Sheet for the current user, returning sheet identifier.
  - `syncHmacKey(token, sheetId, localJwk)`: read/write common HMAC key in Google to share across devices.
  - `pushParties`, `pushTickets`: upload local parties and tickets into sheet rows.
  - `pullAll(token, sheetId)`: read back parties and tickets from sheet for reconciliation.
  - `markTicketUsed(token, sheetId, ticketId, usedAt)`: update remote sheet row when ticket is used.[cite:13]

The UI components treat these as opaque asynchronous calls, surfacing only connection state, errors and last sync time.

---

## 4. Detailed User Flows

### 4.1 End-to-end party planning with calculator

Flow 1: global baseline planning

1. User visits home page (`/`).
2. User chooses "Open Calculator" link, navigating to `/calculator`.
3. Calculator loads global settings from IndexedDB or defaults from `settings.json`.
4. User stays in global mode (party switcher on "Global defaults").
5. In Settings tab:
   - User edits guests, ticket price, venue cost, equipment cost.
   - User adjusts alcohol ml per person until label matches desired intensity.
6. User switches to Drink Menu tab to fine-tune category splits:
   - Adjusts macro percentages for Spirits/Beer/Wine until total is 100 %.
   - For each category:
     - Adds or removes spirits/varieties.
     - For Spirits: adjusts per-spirit share and per-cocktail split within each spirit.
7. If needed, user goes to Catalog tab:
   - Adds/edits ingredients and their prices.
   - Adds new cocktails and recipes.
8. User returns to Settings tab, sees KPI grid update in real-time as `result` changes with menu and settings.
9. If there are menu errors, user is guided by the errors card to fix them in the Drink Menu tab.
10. Once satisfied, user clicks persistent save button:
    - Global settings and menu are persisted under `settings` key.[cite:12]
11. User may export a TXT budget snapshot via "Export TXT" and download a structured report.

Flow 2: per-party override based on existing global baseline

1. User configures a party in Event page (see next section) and chooses to tailor drinks and budget for that party later.
2. In Calculator, party switcher shows newly created party button.
3. User selects party button; working settings and menu are initialised by merging global defaults and party-specific overrides (if any).
4. User edits party-specific guests, ticket price and menu composition.
5. KPIs and shopping list now reflect party-specific values; global defaults remain unchanged.
6. User saves party-specific settings via save bar; party record in IndexedDB receives `partySettings` and `partyMenu` fields.[cite:12][cite:15]
7. Later, user revisits same party via switcher to review or adjust configuration.

### 4.2 Party and ticket lifecycle

Flow 3: creating a party and tickets

1. User navigates to Event page (`/event`).
2. On first visit, there may be no parties; user clicks "+ New party".
3. User fills party name and date, and chooses drink menu template (Default or From scratch).
4. User clicks "Create party"; party is stored in IndexedDB, party list is updated and party is selected.
5. Tickets tab for that party becomes available.
6. User opens Tickets tab (it is active by default when a party is selected).
7. User clicks "+ Add guest" and fills guest name and optional custom "Valid until" datetime.
8. On clicking "Generate ticket", a Ticket is inserted in DB and shown in the ticket list.
9. A QR code is generated for the ticket; once ready, the QR preview is visible in the ticket row.[cite:13]
10. User may create multiple tickets and see statistics update (total, used, expired).
11. User may print all tickets by clicking "Print all", opening a printable window.

Flow 4: sharing individual tickets

1. From ticket list, user clicks share icon on a specific ticket.
2. Share overlay appears, showing QR preview, guest name, and party name.
3. If user chooses "Share via…":
   - App builds ticket PNG via canvas composition.
   - If environment supports file sharing, native share UI opens; user picks WhatsApp, email, etc.
   - Otherwise, PNG is downloaded for manual sharing.
4. If user chooses "Download as Image", PNG file is generated and automatically downloaded.
5. On success or cancellation, share overlay closes.[cite:13]

Flow 5: deleting parties/tickets

- Party delete:
  - User clicks delete icon on a party row.
  - Confirmation is shown; on acceptance, party and all its tickets are removed from DB and UI; if the deleted party was selected, selection is cleared.
- Ticket delete:
  - User clicks delete icon on a ticket row.
  - Confirmation is shown; on acceptance, ticket is removed from DB and UI and its QR image is removed from cache.

### 4.3 Door validation and multi-device scanning

Flow 6: local-only scanning at the door

1. At the door, user (staff) opens Event page and selects relevant party.
2. Staff switches to Scanner tab.
3. Staff taps "Start scanning" to start camera.
4. Guests present QR codes (printed or on phone) to camera; each scan triggers `handleScan` logic.
5. For each scan:
   - Ticket is verified cryptographically.
   - Expiry is checked.
   - Local DB is consulted for usage status.
   - Ticket is marked used and `usedAt` set when valid.
   - Scanner displays overlay with success or error message; success triggers short vibration pattern.
6. Scan history list builds up over time, showing last 20 scans.[cite:13]

Flow 7: multi-device Google Sheets-backed scanning

1. Organizer configures Google Sheet and Apps Script according to Docs page instructions.
2. On one device (e.g., organizer’s phone), user connects Google via sync banner and performs an initial sync.
3. On other devices, user also connects Google, thereby adopting the shared HMAC key and synchronizing parties and tickets.
4. At the event, multiple devices can scan tickets concurrently:
   - Each successful scan updates local DB and calls `markTicketUsed` to update Google Sheet.
   - On sync, other devices that still have the ticket unused will receive remote update marking it as used, preventing double entry.[cite:13]

Flow 8: OAuth and token handling

1. When user clicks connect button, app launches OAuth flow (via `startOAuth`) and opens Google login.
2. Google redirects to `/oauth-callback` with `access_token` in URL hash.
3. OAuth callback page posts token to opener window via `postMessage`, then closes.
4. EventManager receives token, caches it, and uses it for subsequent calls to Google APIs.
5. If any error occurs, OAuth callback posts an error to opener, and EventManager surfaces error status to user through sync status label.[cite:10][cite:13]

---

## 5. Per-page Component Summary

### 5.1 Home (`index.astro`)

- Components used:
  - `NavBar`.
- Functional elements:
  - Navigation into Calculator and Docs.
  - Feature descriptions (non-interactive).

### 5.2 Calculator (`calculator.astro` + `Calculator.vue`)

- Components used:
  - `NavBar`.
  - Vue Calculator (tabs, cards, save bar, forms integrated in a single file).
- Functional capabilities:
  - Party context selection (global vs per-party config).
  - Input of core event financial parameters.
  - Configuration of drink categories, spirits, and cocktails with strict percent-sum rules.
  - Catalog management (ingredients and cocktails CRUD, price overrides).
  - Live calculation of shopping list and financial KPIs.
  - Export of text-based budget summary.
  - Local persistence and party-level overrides.

### 5.3 Event (`event.astro` + `EventManager.vue`)

- Components used:
  - `NavBar`.
  - Vue EventManager (sync banner, party panel, ticket tab, scanner tab, share overlay).
- Functional capabilities:
  - Party CRUD and template selection.
  - Ticket creation, statistics, printing, and deletion.
  - QR generation and caching with cryptographic signing.
  - Google OAuth and multi-device sync via Google Sheets.
  - Camera-based and manual-scanned ticket validation.
  - Ticket usage propagation to remote sheet; reconciliation of remote and local state.
  - Ticket sharing through PNG export and system share UI.

### 5.4 Docs (`docs.astro`)

- Components used:
  - `NavBar`.
- Functional capabilities:
  - Textual guide for calculator, tickets, scanner, and multi-scanner setup.

### 5.5 OAuth callback (`oauth-callback.astro`)

- Components used:
  - None shared; standalone document.
- Functional capabilities:
  - Parse OAuth tokens or errors from URL hash.
  - `postMessage` token/error to opener.
  - Auto-close after a delay.
