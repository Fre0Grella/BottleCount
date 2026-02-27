"""
core.py — Pure calculation logic. No UI, no DB dependencies.
Input:  settings (dict) + catalog (dict)
Output: shopping list with quantities and costs
"""
import math

ALCOHOL_LEVELS = {
    25:  "🌿 Soft",
    50:  "🍹 Aperitivo",
    75:  "🎉 Party",
    100: "🔥 Hardcore"
}

def calculate(settings, catalog):
    n             = settings["guests"]
    alcohol_ml    = settings["alcohol_ml_per_person"]
    buffer        = settings["buffer"]
    menu          = settings["menu"]
    ingredients   = catalog["ingredients"]
    cocktails     = catalog["cocktails"]

    total_alcohol = n * alcohol_ml  # ml of pure alcohol total

    # volume_total[ingredient_name] = ml (or kg for ice/extras)
    volume_total = {}

    for category, cat_data in menu.items():
        macro_pct    = cat_data["macro_pct"]
        cat_alcohol  = total_alcohol * macro_pct

        for spirit_name, spirit_data in cat_data["spirits"].items():
            spirit_pct    = spirit_data["pct"]
            spirit_alcohol = cat_alcohol * spirit_pct

            ing = ingredients.get(spirit_name)
            if not ing:
                continue
            abv = ing.get("abv", 0)

            for drink_name, drink_pct in spirit_data["drinks"].items():
                drink_alcohol = spirit_alcohol * drink_pct

                ck = cocktails.get(drink_name)
                if not ck:
                    continue

                main_spirit  = ck["main_spirit"]
                recipe       = ck["recipe"]

                spirit_recipe = recipe.get(main_spirit, {})
                ml_per_serve  = spirit_recipe.get("quantity", 0)
                spirit_abv    = ingredients.get(main_spirit, {}).get("abv", abv)

                alcohol_per_serve = ml_per_serve * spirit_abv
                if alcohol_per_serve <= 0:
                    continue

                servings = drink_alcohol / alcohol_per_serve

                for ing_name, ing_recipe in recipe.items():
                    qty = ing_recipe["quantity"] * servings
                    volume_total[ing_name] = volume_total.get(ing_name, 0) + qty

    # Fixed per-person items (snacks, cups, etc.)
    extras = settings.get("extras", {})
    for item_name, cfg in extras.items():
        qpp  = cfg.get("qty_per_person", 0)
        minq = cfg.get("min_qty", 0)
        volume_total[item_name] = max(minq, qpp * n)

    # Convert to purchasable units
    shopping_list = []
    for ing_name, vol_total in volume_total.items():
        ing = ingredients.get(ing_name)
        if not ing:
            continue

        bottle_ml = ing.get("volume_ml")
        item_type = ing.get("type", "extra")
        unit      = ing.get("unit", "pcs")

        if bottle_ml and bottle_ml > 0:
            quantity      = math.ceil((vol_total * buffer) / bottle_ml)
            display_unit  = "btl." if bottle_ml >= 250 else "can"
        else:
            quantity     = math.ceil(vol_total * buffer)
            display_unit = unit

        cost_min = round(quantity * ing["price_min"], 2)
        cost_max = round(quantity * ing["price_max"], 2)

        shopping_list.append({
            "name":      ing_name,
            "type":      item_type,
            "quantity":  quantity,
            "unit":      display_unit,
            "cost_min":  cost_min,
            "cost_max":  cost_max,
        })

    shopping_list.sort(key=lambda x: (x["type"], x["name"]))

    total_min   = sum(r["cost_min"] for r in shopping_list)
    total_max   = sum(r["cost_max"] for r in shopping_list)
    fixed_costs = settings["venue_cost"] + settings["equipment_cost"]
    revenue     = n * settings["ticket_price"]
    profit_min  = revenue - total_max - fixed_costs
    profit_max  = revenue - total_min - fixed_costs

    avg_var_cost  = (total_min + total_max) / 2 / n if n > 0 else 0
    margin        = settings["ticket_price"] - avg_var_cost
    break_even    = math.ceil(fixed_costs / margin) if margin > 0 else None

    return {
        "shopping_list": shopping_list,
        "total_min":     round(total_min, 2),
        "total_max":     round(total_max, 2),
        "fixed_costs":   fixed_costs,
        "revenue":       revenue,
        "profit_min":    round(profit_min, 2),
        "profit_max":    round(profit_max, 2),
        "break_even":    break_even,
    }


def validate_menu(menu):
    """
    Returns a list of validation errors for the 3-level percentage tree.
    Empty list = all good.
    """
    errors = []
    macro_sum = sum(v["macro_pct"] for v in menu.values())
    if abs(macro_sum - 1.0) > 0.01:
        errors.append(f"Macro categories sum = {macro_sum*100:.1f}% (must be 100%)")

    for cat, cat_data in menu.items():
        spirits     = cat_data.get("spirits", {})
        spirits_sum = sum(v["pct"] for v in spirits.values())
        if abs(spirits_sum - 1.0) > 0.01:
            errors.append(f"[{cat}] Spirits sum = {spirits_sum*100:.1f}% (must be 100%)")

        for spirit, spirit_data in spirits.items():
            drinks_sum = sum(spirit_data["drinks"].values())
            if abs(drinks_sum - 1.0) > 0.01:
                errors.append(f"[{cat} → {spirit}] Drinks sum = {drinks_sum*100:.1f}% (must be 100%)")

    return errors
