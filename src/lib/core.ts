import type {
  Settings,
  Catalog,
  CalculationResult,
  ShoppingItem,
} from './types';
import { isSimpleCategory } from '../features/menu/menu';

/**
 * Whether the host plans the drinks for this party. Absent means yes: parties
 * saved, or synced from a server, before the switch existed.
 */
export function runsBar(party: { barManaged?: boolean }): boolean {
  return party.barManaged !== false;
}

/**
 * The settings a party's numbers are calculated from.
 *
 * When the venue runs the bar there is nothing to buy, so the menu and extras
 * are left out here rather than deleted from the party — which is what makes
 * the switch reversible. Fixed costs and ticket revenue still count.
 */
export function planFor(settings: Settings, barManaged: boolean): Settings {
  return barManaged ? settings : { ...settings, menu: {}, extras: {} };
}

/** The per-person venue fee, or 0 for a party saved before it existed. */
export function venueFeePerPerson(settings: {
  venue_fee_per_person?: number;
}): number {
  const fee = settings.venue_fee_per_person;
  return typeof fee === 'number' && Number.isFinite(fee) && fee > 0 ? fee : 0;
}

/**
 * What the venue's per-person fee comes to for `guests` people — the guests
 * the host is bringing, which on a paid party means the ones marked as paid.
 */
export function venueFeeFor(
  settings: { venue_fee_per_person?: number },
  guests: number,
): number {
  return Math.round(venueFeePerPerson(settings) * guests * 100) / 100;
}

export function calculate(
  settings: Settings,
  catalog: Catalog,
): CalculationResult {
  const {
    guests: n,
    alcohol_ml_per_person,
    buffer,
    menu,
    extras,
    venue_cost,
    equipment_cost,
    ticket_price,
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

      if (isSimpleCategory(category)) {
        if ((ing.abv ?? 0) <= 0) continue;
        volumeTotal[spiritName] =
          (volumeTotal[spiritName] ?? 0) + spiritAlcohol / ing.abv;
      } else {
        for (const [drinkName, drinkPct] of Object.entries(
          spiritData.drinks ?? {},
        )) {
          const ck = cocktails[drinkName];
          if (!ck) continue;
          const mainRecipe = ck.recipe[ck.main_spirit];
          const mlPerServe = mainRecipe?.quantity ?? 0;
          const spiritAbv = ingredients[ck.main_spirit]?.abv ?? ing.abv;
          const alcoholPerServe = mlPerServe * spiritAbv;
          if (alcoholPerServe <= 0) continue;
          const servings = (spiritAlcohol * drinkPct) / alcoholPerServe;
          for (const [ingName, ingRecipe] of Object.entries(ck.recipe)) {
            volumeTotal[ingName] =
              (volumeTotal[ingName] ?? 0) + ingRecipe.quantity * servings;
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
    const bottleMl = ing.volume_ml;
    const quantity = bottleMl
      ? Math.ceil((volTotal * buffer) / bottleMl)
      : Math.ceil(volTotal * buffer);
    const displayUnit =
      bottleMl && bottleMl >= 250 ? 'btl.' : (ing.unit ?? 'pcs');
    shoppingList.push({
      name: ingName,
      type: ing.type,
      quantity,
      unit: displayUnit,
      cost_min: Math.round(quantity * ing.price_min * 100) / 100,
      cost_max: Math.round(quantity * ing.price_max * 100) / 100,
    });
  }

  shoppingList.sort(
    (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
  );

  const totalMin = shoppingList.reduce((s, r) => s + r.cost_min, 0);
  const totalMax = shoppingList.reduce((s, r) => s + r.cost_max, 0);
  const fixedCosts = venue_cost + equipment_cost;
  // A per-person fee grows with the guest list, so it is a cost per ticket
  // rather than a fixed one: it comes off each guest's margin, which is what
  // break-even divides the fixed costs by.
  const feePerPerson = venueFeePerPerson(settings);
  const venueFees = venueFeeFor(settings, n);
  const revenue = n * ticket_price;
  const avgVarCost = (totalMin + totalMax) / 2 / (n || 1);
  const margin = ticket_price - avgVarCost - feePerPerson;

  return {
    shopping_list: shoppingList,
    total_min: Math.round(totalMin * 100) / 100,
    total_max: Math.round(totalMax * 100) / 100,
    fixed_costs: fixedCosts,
    venue_fees: venueFees,
    revenue,
    profit_min:
      Math.round((revenue - totalMax - fixedCosts - venueFees) * 100) / 100,
    profit_max:
      Math.round((revenue - totalMin - fixedCosts - venueFees) * 100) / 100,
    break_even: margin > 0 ? Math.ceil(fixedCosts / margin) : null,
  };
}
