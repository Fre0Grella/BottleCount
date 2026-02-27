import os, io
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file
from store import get_catalog, save_catalog, get_settings, save_settings
from core import calculate, validate_menu, ALCOHOL_LEVELS

app = Flask(__name__)

# ── PAGES ────────────────────────────────────────────────────

@app.route("/")
def dashboard():
    settings = get_settings()
    catalog  = get_catalog()
    errors   = validate_menu(settings["menu"])
    result   = calculate(settings, catalog) if not errors else None
    return render_template("dashboard.html",
        settings=settings, result=result,
        errors=errors, levels=ALCOHOL_LEVELS)

@app.route("/menu")
def menu():
    settings = get_settings()
    catalog  = get_catalog()
    errors   = validate_menu(settings["menu"])
    return render_template("menu.html",
        settings=settings, catalog=catalog, errors=errors)

@app.route("/catalog")
def catalog_page():
    catalog = get_catalog()
    return render_template("catalog.html", catalog=catalog)

# ── API: global settings ──────────────────────────────────────

@app.route("/api/settings", methods=["POST"])
def api_settings():
    s = get_settings()
    for key in ["guests", "ticket_price", "venue_cost", "equipment_cost",
                "alcohol_ml_per_person", "buffer"]:
        if key in request.json:
            s[key] = request.json[key]
    save_settings(s)
    return jsonify({"ok": True})

# ── API: save 3-level menu ────────────────────────────────────

@app.route("/api/menu", methods=["POST"])
def api_menu():
    s = get_settings()
    s["menu"] = request.json["menu"]
    # structural=True  -> skip validation (adding/removing spirits or drinks)
    # structural=False -> validate sums (explicit Save Menu button only)
    if not request.json.get("structural", False):
        errors = validate_menu(s["menu"])
        if errors:
            return jsonify({"ok": False, "errors": errors}), 400
    save_settings(s)
    return jsonify({"ok": True})

# ── API: recalculate (AJAX) ───────────────────────────────────

@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    s = get_settings()
    c = get_catalog()
    errors = validate_menu(s["menu"])
    if errors:
        return jsonify({"ok": False, "errors": errors}), 400
    return jsonify({"ok": True, "result": calculate(s, c)})

# ── API: ingredients CRUD ─────────────────────────────────────

@app.route("/api/catalog/ingredient", methods=["POST"])
def add_ingredient():
    catalog = get_catalog()
    data    = request.json
    name    = data.get("name", "").strip()
    if not name or name in catalog["ingredients"]:
        return jsonify({"ok": False, "error": "Name missing or already exists"}), 400
    vol = data.get("volume_ml")
    catalog["ingredients"][name] = {
        "type":      data.get("type", "extra"),
        "abv":       float(data.get("abv", 0)),
        "volume_ml": int(vol) if vol else None,
        "unit":      data.get("unit", "pcs"),
        "price_min": float(data.get("price_min", 0)),
        "price_max": float(data.get("price_max", 0)),
    }
    save_catalog(catalog)
    return jsonify({"ok": True})

@app.route("/api/catalog/ingredient/price", methods=["POST"])
def update_ingredient_price():
    catalog = get_catalog()
    data    = request.json
    name    = data.get("name", "").strip()
    if not name or name not in catalog["ingredients"]:
        return jsonify({"ok": False, "error": "Ingredient not found"}), 404
    price_min = float(data.get("price_min", 0))
    price_max = float(data.get("price_max", 0))
    if price_min > price_max:
        return jsonify({"ok": False, "error": "Min price cannot exceed max price"}), 400
    catalog["ingredients"][name]["price_min"] = price_min
    catalog["ingredients"][name]["price_max"] = price_max
    save_catalog(catalog)
    return jsonify({"ok": True})

@app.route("/api/catalog/ingredient/<name>", methods=["DELETE"])
def delete_ingredient(name):
    catalog = get_catalog()
    catalog["ingredients"].pop(name, None)
    save_catalog(catalog)
    return jsonify({"ok": True})

# ── API: cocktails CRUD ───────────────────────────────────────

@app.route("/api/catalog/cocktail", methods=["POST"])
def add_cocktail():
    catalog = get_catalog()
    data    = request.json
    name    = data.get("name", "").strip()
    if not name or name in catalog["cocktails"]:
        return jsonify({"ok": False, "error": "Name missing or already exists"}), 400
    catalog["cocktails"][name] = {
        "main_spirit": data["main_spirit"],
        "category":    data["category"],
        "recipe":      data["recipe"],
    }
    save_catalog(catalog)
    return jsonify({"ok": True})

@app.route("/api/catalog/cocktail/<name>", methods=["DELETE"])
def delete_cocktail(name):
    catalog = get_catalog()
    catalog["cocktails"].pop(name, None)
    save_catalog(catalog)
    return jsonify({"ok": True})

# ── API: export shopping list as TXT ─────────────────────────

@app.route("/api/export")
def export_txt():
    s = get_settings()
    c = get_catalog()
    r = calculate(s, c)
    lines = [
        "=" * 62,
        f"  PARTY BUDGET - {s['guests']} GUESTS",
        "=" * 62,
        f"  Ticket price : E{s['ticket_price']}",
        f"  Venue cost   : E{s['venue_cost']}",
        f"  Equipment    : E{s['equipment_cost']}",
        f"  Revenue      : E{r['revenue']}",
        f"  Profit       : E{r['profit_min']} - E{r['profit_max']}",
        f"  Break-even   : {r['break_even']} guests",
        "",
        "=" * 62,
        "  SHOPPING LIST",
        "=" * 62,
        f"  {'Type':<8} {'Item':<26} {'Qty':>5} {'Unit':<6} {'Min E':>7} {'Max E':>7}",
        "  " + "-" * 60,
    ]
    for item in r["shopping_list"]:
        lines.append(
            f"  {item['type']:<8} {item['name']:<26} {item['quantity']:>5} "
            f"{item['unit']:<6} {item['cost_min']:>7.2f} {item['cost_max']:>7.2f}"
        )
    lines += [
        "  " + "-" * 60,
        f"  TOTAL SPEND  : E{r['total_min']} - E{r['total_max']}",
        f"  TOTAL (incl. fixed): E{r['total_min'] + r['fixed_costs']} - E{r['total_max'] + r['fixed_costs']}",
        f"\n  Generated on {datetime.now().strftime('%d/%m/%Y %H:%M')}",
    ]
    buf = io.BytesIO("\n".join(lines).encode("utf-8"))
    buf.seek(0)
    filename = f"shopping_list_{datetime.now().strftime('%Y%m%d')}.txt"
    return send_file(buf, as_attachment=True, download_name=filename, mimetype="text/plain")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
