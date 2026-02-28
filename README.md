# 🍾 BottleCount

Plan your party like an engineer. Configure drinks, cocktail recipes, and headcount — get a precise shopping list, profit margin, and break-even point in seconds.

[![Python](https://img.shields.io/badge/Python-3.11+-blue?logo=python)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.x-black?logo=flask)](https://flask.palletsprojects.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![Deploy on Railway](https://img.shields.io/badge/Deploy-Railway-blueviolet?logo=railway)](https://railway.app)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

## What It Does

BottleCount takes the guesswork out of organizing a ticketed party. You define **who's coming**, **what they're drinking**, and **what it costs** — the app calculates everything else: how many bottles to buy, how much you'll spend, when you break even, and how much profit you walk away with.

No spreadsheets. No magic numbers. Everything is driven by your cocktail menu.

---

## Features

### 🍸 Drink Menu Engine

The menu is organized into three category types:

- **Spirits** — 3-level structure: category → spirit → cocktail. For each spirit (e.g. Vodka), you configure which cocktails are served (e.g. 40% Vodka Lemon, 60% Vodka Redbull) and their recipes drive the mixer quantities automatically.
- **Beer** — 2-level: category → variety with a percentage split. No cocktail layer — served as-is. Example: 100% Beer 66cl, or 60% Lager / 40% Craft.
- **Wine** — 2-level: same as Beer. Example: 70% Red Wine / 30% White Wine.

This distinction means Beer and Wine skip the cocktail configuration entirely — you just set the split between varieties.

Alcohol intensity presets: 🌿 Soft · 🍹 Aperitivo · 🎉 Party · 🔥 Hardcore — pure-alcohol target per person (25/50/75/100 ml).

### 🛒 Smart Shopping List

- Auto-calculates bottle counts per ingredient based on ABV, bottle volume, and drink ratios
- Supports **min/max price ranges** per item (best deal vs. shelf price)
- All quantities scale automatically when headcount changes
- 10% safety buffer included by default

### 📊 Financial Dashboard

- Real-time **profit range** (min/max) based on price ranges
- **Cost breakdown doughnut chart** by category (Spirits, Wine, Beer, Mixers, Snacks, Fixed costs)
- KPI cards: Revenue, Spend, Fixed costs, Profit, Break-even guests
- Color-coded type badges throughout (amber for spirits, gold for beer, purple for wine, cyan for mixers)

### 📱 Mobile-First UI

All three pages are designed mobile-first:

- Sticky scrollable nav that never wraps or overflows
- Large touch targets (min 44px) on all inputs and buttons
- Shopping list uses flex-row cards instead of a table — no horizontal scroll
- KPI grid adapts: 2-col on mobile → 3-col on tablet → 5-col on desktop
- Collapsible sections (Shopping List, Cost Breakdown, Ingredients, Cocktails) to save screen space
- Ingredient cards with inline price editing — no page reload needed

### 🗂️ Catalog Management

- Full CRUD for ingredients and cocktails via the web UI
- Inline price editing with live save — click 💾 per row, no form submission
- Add cocktails with a recipe builder (ingredient + quantity + unit)
- Beer and Wine ingredients are separate from Spirits in the catalog; cocktail creation only allows Spirit-type bases
- Delete buttons work for both shared catalog entries (hidden per user) and personal additions

### 🔐 Auth & Multi-User

- Google OAuth sign-in — each user gets their own isolated settings and menu
- Unauthenticated users can browse but see a toast notification when attempting to save
- `store.py` abstraction layer: in DB mode (Supabase), changes are per-user; in local mode (no `DATABASE_URL`), falls back to JSON files

### ☁️ Cloud-Ready

- All data persisted in **Supabase PostgreSQL** — no data loss on redeploy
- `store.py` acts as a clean abstraction layer — swap backend without touching business logic
- Deployable in ~5 minutes on Railway or Render (free tier)

---

## Architecture

```
bottle-count/
│
├── server.py          # Flask app — all routes (pages + API + auth)
├── core.py            # Pure calculation logic (no I/O, fully testable)
├── store.py           # Data layer — Supabase or local JSON (swappable)
│
├── templates/
│   ├── base.html      # Shared layout, nav, auth UI, JS helpers (toggleSection, apiPost, apiDelete)
│   ├── dashboard.html # Settings, KPI cards, shopping list, doughnut chart
│   ├── menu.html      # Drink menu: macro split + per-category config
│   └── catalog.html   # Ingredient & cocktail CRUD
│
├── data/
│   ├── catalog.json   # Default ingredients + cocktail recipes (shared baseline)
│   └── settings.json  # Default settings (used when DATABASE_URL is not set)
│
├── requirements.txt
├── Procfile           # gunicorn entry point
└── nixpacks.toml
```

**Key design principle:** `core.py` has zero I/O. It only takes plain Python dicts in and returns results — making it trivially testable and reusable.

---

## Getting Started

### Prerequisites

- Python 3.11+
- A free [Supabase](https://supabase.com) account (optional — app works locally without it)
- A [Google Cloud](https://console.cloud.google.com) project with OAuth 2.0 credentials (optional for auth)

### Local Setup (no auth, JSON files)

```bash
git clone https://github.com/YOUR_USERNAME/bottle-count.git
cd bottle-count

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt
python server.py
```

Open [http://localhost:5000](http://localhost:5000). Without `DATABASE_URL` and Google credentials, the app runs in local mode — data is stored in `data/settings.json`, no login required.

### Full Setup (auth + cloud DB)

Create a `.env` file:

```env
DATABASE_URL=postgresql://...        # Supabase connection string
SECRET_KEY=your-flask-secret-key
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

For Google OAuth, set the authorized redirect URI to:
```
https://your-domain.com/auth/callback
```

Run:

```bash
python server.py
```

---

## Cloud Deploy (Railway)

1. Push the repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**
3. Add environment variables in Railway's dashboard (`DATABASE_URL`, `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
4. Click **Generate Domain** — you're live

---

## How the Calculation Works

### Spirits (3-level)

The core formula for each spirit bottle count:

$$
\text{bottles} = \left\lceil \frac{N \times \text{alcohol target} \times \text{buffer} \times \text{macro\%} \times \text{spirit\%} \times \text{drink\%}}{\text{ABV} \times \text{bottle ml}} \right\rceil
$$

Mixer quantities are derived directly from cocktail recipes — if Vodka Redbull uses 250ml of energy drink per serving, and there are 400 servings, the energy drink quantity is computed automatically.

### Beer & Wine (2-level)

Simpler formula — no cocktail recipe needed:

$$
\text{bottles} = \left\lceil \frac{N \times \text{alcohol target} \times \text{buffer} \times \text{macro\%} \times \text{variety\%}}{\text{ABV} \times \text{bottle ml}} \right\rceil
$$

### Break-even

$$
N_{\text{be}} = \left\lceil \frac{\text{fixed costs}}{\text{ticket price} - \text{avg variable cost per person}} \right\rceil
$$

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 + Flask 3.x |
| Auth | Google OAuth via Authlib |
| Database | Supabase (PostgreSQL) or local JSON |
| Charts | Chart.js 4 |
| Styling | Tailwind CSS (CDN) + custom mobile-first CSS |
| Deploy | Railway / Render |
| Data layer | `store.py` abstraction (swappable) |

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

For commercial use without open-source obligations, contact the author.
