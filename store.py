import json, os

DATABASE_URL = os.environ.get("DATABASE_URL")
USE_DB = bool(DATABASE_URL)

BASE     = os.path.join(os.path.dirname(__file__), "data")
CAT_PATH = os.path.join(BASE, "catalog.json")
SET_PATH = os.path.join(BASE, "settings.json")

def _load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def _save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def _get_conn():
    import psycopg2
    return psycopg2.connect(DATABASE_URL, sslmode="require")

def _db_init():
    conn = _get_conn()
    cur  = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_data (
            user_id TEXT NOT NULL,
            key     TEXT NOT NULL,
            value   JSONB NOT NULL,
            PRIMARY KEY (user_id, key)
        );
    """)
    conn.commit(); cur.close(); conn.close()

def _db_get(user_id, key, default):
    conn = _get_conn()
    cur  = conn.cursor()
    cur.execute("SELECT value FROM user_data WHERE user_id=%s AND key=%s", (user_id, key))
    row  = cur.fetchone()
    cur.close(); conn.close()
    return row[0] if row else default

def _db_set(user_id, key, value):
    conn = _get_conn()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO user_data (user_id, key, value) VALUES (%s, %s, %s)
        ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
    """, (user_id, key, json.dumps(value, ensure_ascii=False)))
    conn.commit(); cur.close(); conn.close()

if USE_DB:
    _db_init()

# ── Helpers ────────────────────────────────────────────────────

def _default_catalog():   return _load_json(CAT_PATH)
def _default_settings():  return _load_json(SET_PATH)

# ── Public API ─────────────────────────────────────────────────

def get_catalog(user_id=None):
    defaults = _default_catalog()
    if not user_id or not USE_DB:
        return defaults

    hidden_ing      = set(_db_get(user_id, "hidden_ingredients",  []))
    hidden_cock     = set(_db_get(user_id, "hidden_cocktails",    []))
    personal_ing    =     _db_get(user_id, "personal_ingredients", {})
    personal_cock   =     _db_get(user_id, "personal_cocktails",   {})
    price_overrides =     _db_get(user_id, "price_overrides",      {})

    # Ingredients: remove hidden, apply price overrides, add personal
    ingredients = {k: v for k, v in defaults["ingredients"].items() if k not in hidden_ing}
    for name, override in price_overrides.items():
        if name in ingredients:
            ingredients[name] = {**ingredients[name], **override}
    ingredients.update(personal_ing)

    # Cocktails: remove hidden, add personal
    cocktails = {k: v for k, v in defaults["cocktails"].items() if k not in hidden_cock}
    cocktails.update(personal_cock)

    return {"ingredients": ingredients, "cocktails": cocktails}

def add_ingredient(user_id, name, data):
    personal = _db_get(user_id, "personal_ingredients", {})
    personal[name] = data
    _db_set(user_id, "personal_ingredients", personal)

def delete_ingredient(user_id, name):
    if name in _default_catalog()["ingredients"]:
        hidden = _db_get(user_id, "hidden_ingredients", [])
        if name not in hidden:
            hidden.append(name)
        _db_set(user_id, "hidden_ingredients", hidden)
    else:
        personal = _db_get(user_id, "personal_ingredients", {})
        personal.pop(name, None)
        _db_set(user_id, "personal_ingredients", personal)

def update_ingredient_price(user_id, name, price_min, price_max):
    if name in _default_catalog()["ingredients"]:
        overrides = _db_get(user_id, "price_overrides", {})
        overrides[name] = {"price_min": price_min, "price_max": price_max}
        _db_set(user_id, "price_overrides", overrides)
    else:
        personal = _db_get(user_id, "personal_ingredients", {})
        if name in personal:
            personal[name]["price_min"] = price_min
            personal[name]["price_max"] = price_max
            _db_set(user_id, "personal_ingredients", personal)

def add_cocktail(user_id, name, data):
    personal = _db_get(user_id, "personal_cocktails", {})
    personal[name] = data
    _db_set(user_id, "personal_cocktails", personal)

def delete_cocktail(user_id, name):
    if name in _default_catalog()["cocktails"]:
        hidden = _db_get(user_id, "hidden_cocktails", [])
        if name not in hidden:
            hidden.append(name)
        _db_set(user_id, "hidden_cocktails", hidden)
    else:
        personal = _db_get(user_id, "personal_cocktails", {})
        personal.pop(name, None)
        _db_set(user_id, "personal_cocktails", personal)

def get_settings(user_id=None):
    if not user_id or not USE_DB:
        return _default_settings()
    return _db_get(user_id, "settings", _default_settings())

def save_settings(user_id, data):
    if USE_DB:
        _db_set(user_id, "settings", data)
    else:
        _save_json(SET_PATH, data)
