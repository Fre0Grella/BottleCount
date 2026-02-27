"""
store.py — Single data access layer.

- Local development: reads/writes JSON files in data/
- Production (Supabase): reads/writes PostgreSQL via DATABASE_URL env var

To switch between modes, just set or unset DATABASE_URL in your environment.
Nothing else in the codebase changes.
"""
import json, os

# ── Detect mode ───────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL")
USE_DB = bool(DATABASE_URL)

# ── JSON fallback (local) ─────────────────────────────────────
BASE     = os.path.join(os.path.dirname(__file__), "data")
CAT_PATH = os.path.join(BASE, "catalog.json")
SET_PATH = os.path.join(BASE, "settings.json")

def _load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def _save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

# ── Supabase / PostgreSQL ─────────────────────────────────────
def _get_conn():
    import psycopg2
    return psycopg2.connect(DATABASE_URL, sslmode="require")

def _db_init():
    """Create tables if they do not exist yet. Runs once on startup."""
    conn = _get_conn()
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS kv_store (
            key   TEXT PRIMARY KEY,
            value JSONB NOT NULL
        );
    """)
    conn.commit()
    # Seed from local JSON files if the table is empty
    cur.execute("SELECT COUNT(*) FROM kv_store;")
    if cur.fetchone()[0] == 0:
        for key, path in [("catalog", CAT_PATH), ("settings", SET_PATH)]:
            data = _load_json(path)
            cur.execute(
                "INSERT INTO kv_store (key, value) VALUES (%s, %s)",
                (key, json.dumps(data))
            )
        conn.commit()
    cur.close()
    conn.close()

def _db_get(key):
    conn = _get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT value FROM kv_store WHERE key = %s;", (key,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return row[0] if row else {}

def _db_set(key, data):
    conn = _get_conn()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO kv_store (key, value) VALUES (%s, %s)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    """, (key, json.dumps(data, ensure_ascii=False)))
    conn.commit()
    cur.close()
    conn.close()

# ── Public API ────────────────────────────────────────────────
if USE_DB:
    _db_init()

def get_catalog():
    return _db_get("catalog") if USE_DB else _load_json(CAT_PATH)

def save_catalog(data):
    _db_set("catalog", data) if USE_DB else _save_json(CAT_PATH, data)

def get_settings():
    return _db_get("settings") if USE_DB else _load_json(SET_PATH)

def save_settings(data):
    _db_set("settings", data) if USE_DB else _save_json(SET_PATH, data)
