# 🍹 BottleCount

Plan your party like an engineer. Configure drinks, cocktail recipes, and headcount — get a precise shopping list, profit margin, and break-even point in seconds.

[![Python](https://img.shields.io/badge/Python-3.11+-blue?logo=python)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.x-black?logo=flask)](https://flask.palletsprojects.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![Deploy on Railway](https://img.shields.io/badge/Deploy-Railway-blueviolet?logo=railway)](https://railway.app)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

## What It Does

BottleCount takes the guesswork out of organizing a ticketed party.
You define **who's coming**, **what they're drinking**, and **what it costs** —
the app calculates everything else: how many bottles to buy, how much you'll spend, when you break even, and how much profit you walk away with.

No spreadsheets. No magic numbers. Everything is driven by your cocktail menu.

---

## Features

### 🍸 Drink Menu Engine
- Define your party's macro split: **Beer / Wine / Spirits** (adjustable percentages)
- For each spirit, configure cocktail ratios — e.g. Vodka → 30% Redbull, 40% Lemon, 30% Orange
- Mixer quantities are **automatically derived** from cocktail recipes, not hardcoded
- Alcohol intensity presets: 🟢 Light Aperitivo · 🟡 Party · 🔴 Full Send — configurable pure-alcohol target per person (25/50/75/100 ml)

### 🛒 Smart Shopping List
- Auto-calculates bottle counts per ingredient based on ABV, bottle volume, and drink ratios
- Supports **min/max price ranges** per item (best deal vs. shelf price)
- All quantities scale automatically when headcount changes
- Add custom ingredients and cocktails through the UI — changes persist

### 📊 Financial Dashboard
- Real-time **profit range** (min/max) based on price ranges
- Interactive **Margin vs. Headcount** chart with break-even line
- **Cost breakdown pie chart** by category (Spirits, Wine, Beer, Mixers, Snacks, Venue, Equipment)
- Fixed costs (venue rental, sound system) tracked separately from variable costs

### 🗂️ Catalog Management
- Built-in catalog of ingredients (with ABV and bottle volumes) and base cocktail recipes
- Full **CRUD** for ingredients and cocktails via the web UI
- Add new ingredients specifying format (ml), ABV (for spirits), and category
- Add new cocktails with proportional composition (mixer ratios, ice included)

### ☁️ Cloud-Ready
- All data persisted in **Supabase PostgreSQL** — no data loss on redeploy
- `store.py` acts as a clean abstraction layer — swap backend without touching business logic
- Deployable in ~5 minutes on Railway or Render (free tier)
- Fully accessible from any device via browser — no app installation needed

---

## Architecture

```
bottle-count/
│
├── server.py          # Flask app — all API routes
├── core.py            # Pure calculation logic (no I/O, fully testable)
├── store.py           # Data layer — reads/writes to Supabase (swap here to change DB)
│
├── templates/
│   ├── dashboard.html # Main planning view + charts
│   ├── menu.html      # Drink menu configuration (macro %, cocktail ratios)
│   └── catalog.html   # Ingredient & cocktail CRUD
│
├── requirements.txt
├── Procfile           # Railway/Render deploy config
└── nixpacks.toml
```

**Key design principle:** `core.py` has zero I/O. It only takes plain Python dicts in and returns results — making it trivially testable and reusable.

---

## Getting Started

### Prerequisites
- Python 3.11+
- A free [Supabase](https://supabase.com) account
- (Optional) A [Railway](https://railway.app) account for cloud deploy

### Local Setup

```bash
git clone https://github.com/YOUR_USERNAME/bottle-count.git
cd bottle-count

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

Create a `.env` file:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
FLASK_SECRET_KEY=your-secret-key
```

Run:

```bash
python server.py
```

Open [http://localhost:5000](http://localhost:5000).

---

## Cloud Deploy (Railway)

1. Push the repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**
3. Add your environment variables in Railway's dashboard
4. Click **Generate Domain** — you're live

---

## How the Calculation Works

The core formula for bottle count of any spirit is:

$$
\text{bottles} = \left\lceil \frac{N \times \text{alcohol target} \times \text{buffer} \times \text{macro\%} \times \text{spirit\%}}{\text{ABV} \times \text{vol bottle}} \right\rceil
$$


Where:
- `N` = number of guests
- `alcohol_target` = ml of pure alcohol per person (set by intensity preset)
- `buffer` = 1.10 (10% safety margin)
- `macro%` / `spirit%` = percentages from your menu configuration

Mixer quantities are derived directly from cocktail recipes — if Vodka Redbull is 50% of Vodka cocktails and each serving is 200ml, the energy drink quantity is computed automatically.

Break-even uses the standard contribution margin formula:

$$
N_{\text{be}} = \frac{\text{fixed costs}}{\text{ticket price} - \text{variable cost per person}}
$$

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 + Flask |
| Database | Supabase (PostgreSQL) |
| Charts | Chart.js |
| Deploy | Railway / Render |
| Data layer | `store.py` abstraction (swappable) |

---

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

For commercial use without open-source obligations, contact the author.
