import type { Settings, Catalog, CalculationResult, ShoppingItem } from './types';

const SIMPLE_CATEGORIES = new Set(['Beer', 'Wine']);

export const ALCOHOL_LEVELS: Record<number, string> = {
  25:  '🌿 Soft',
  50:  '🍹 Aperitivo',
  75:  '🎉 Party',
  100: '🔥 Hardcore',
};

export function calculate(settings: Settings, catalog: Catalog): CalculationResult {
  const {
    guests: n, alcohol_ml_per_person, buffer, menu, extras,
    venue_cost, equipment_cost, ticket_price,
  } = settings;
  const { ingredients, cocktails } = catalog;

  const totalAlcohol = n * alcohol_ml_per_person;
  const volumeTotal: Record<string, number> = {};

  for (const [category, catData] of Object.entries(menu)) {
    const catAlcohol = totalAlcohol * catData.macro_pct;

    for (const [spiritName, spiritData] of Object.entries(catData.spirits)) {
      const spiritAlcohol = catAlcohol * spiritData.pct;
      const ing = ingredients[spiritName];
      if (!ing) continue;

      if (SIMPLE_CATEGORIES.has(category)) {
        if ((ing.abv ?? 0) <= 0) continue;
        volumeTotal[spiritName] = (volumeTotal[spiritName] ?? 0) + spiritAlcohol / ing.abv;
      } else {
        for (const [drinkName, drinkPct] of Object.entries(spiritData.drinks ?? {})) {
          const ck = cocktails[drinkName];
          if (!ck) continue;
          const mainRecipe      = ck.recipe[ck.main_spirit];
          const mlPerServe      = mainRecipe?.quantity ?? 0;
          const spiritAbv       = ingredients[ck.main_spirit]?.abv ?? ing.abv;
          const alcoholPerServe = mlPerServe * spiritAbv;
          if (alcoholPerServe <= 0) continue;
          const servings = (spiritAlcohol * drinkPct) / alcoholPerServe;
          for (const [ingName, ingRecipe] of Object.entries(ck.recipe)) {
            volumeTotal[ingName] = (volumeTotal[ingName] ?? 0) + ingRecipe.quantity * servings;
          }
        }
      }
    }
  }

  // Fixed per-person extras
  for (const [itemName, cfg] of Object.entries(extras)) {
    volumeTotal[itemName] = Math.max(cfg.min_qty ?? 0, cfg.qty_per_person * n);
  }

  const shoppingList: ShoppingItem[] = [];
  for (const [ingName, volTotal] of Object.entries(volumeTotal)) {
    const ing = ingredients[ingName];
    if (!ing) continue;
    const bottleMl    = ing.volume_ml;
    const quantity    = bottleMl
      ? Math.ceil((volTotal * buffer) / bottleMl)
      : Math.ceil(volTotal * buffer);
    const displayUnit = bottleMl && bottleMl >= 250 ? 'btl.' : (ing.unit ?? 'pcs');
    shoppingList.push({
      name:     ingName,
      type:     ing.type,
      quantity,
      unit:     displayUnit,
      cost_min: Math.round(quantity * ing.price_min * 100) / 100,
      cost_max: Math.round(quantity * ing.price_max * 100) / 100,
    });
  }

  shoppingList.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

  const totalMin   = shoppingList.reduce((s, r) => s + r.cost_min, 0);
  const totalMax   = shoppingList.reduce((s, r) => s + r.cost_max, 0);
  const fixedCosts = venue_cost + equipment_cost;
  const revenue    = n * ticket_price;
  const avgVarCost = (totalMin + totalMax) / 2 / (n || 1);
  const margin     = ticket_price - avgVarCost;

  return {
    shopping_list: shoppingList,
    total_min:     Math.round(totalMin * 100) / 100,
    total_max:     Math.round(totalMax * 100) / 100,
    fixed_costs:   fixedCosts,
    revenue,
    profit_min:    Math.round((revenue - totalMax - fixedCosts) * 100) / 100,
    profit_max:    Math.round((revenue - totalMin - fixedCosts) * 100) / 100,
    break_even:    margin > 0 ? Math.ceil(fixedCosts / margin) : null,
  };
}

export function validateMenu(menu: Settings['menu']): string[] {
  const errors: string[] = [];
  const macroSum = Object.values(menu).reduce((s, v) => s + v.macro_pct, 0);
  if (Math.abs(macroSum - 1.0) > 0.01)
    errors.push(`Macro categories sum = ${(macroSum * 100).toFixed(1)}% (must be 100%)`);

  for (const [cat, catData] of Object.entries(menu)) {
    const spiritsSum = Object.values(catData.spirits).reduce((s, v) => s + v.pct, 0);
    if (Math.abs(spiritsSum - 1.0) > 0.01)
      errors.push(`[${cat}] Spirits sum = ${(spiritsSum * 100).toFixed(1)}% (must be 100%)`);

    if (!SIMPLE_CATEGORIES.has(cat)) {
      for (const [spirit, spiritData] of Object.entries(catData.spirits)) {
        const drinksSum = Object.values(spiritData.drinks ?? {}).reduce((s, v) => s + v, 0);
        if (Math.abs(drinksSum - 1.0) > 0.01)
          errors.push(`[${cat} → ${spirit}] Drinks sum = ${(drinksSum * 100).toFixed(1)}% (must be 100%)`);
      }
    }
  }
  return errors;
}
