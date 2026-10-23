import type { IngredientType, ShoppingItem } from '../../lib/types';

/** The order the shopping list's sections come in. */
const TYPE_ORDER: IngredientType[] = [
  'spirit',
  'beer',
  'wine',
  'mixer',
  'extra',
  'snack',
];

/** The list in sections by type, each with its cost range; empty ones out. */
export function shoppingGroups(list: ShoppingItem[]): {
  type: IngredientType;
  items: ShoppingItem[];
  subtotalMin: number;
  subtotalMax: number;
}[] {
  return TYPE_ORDER.flatMap((type) => {
    const items = list.filter((item) => item.type === type);
    if (items.length === 0) return [];
    return [
      {
        type,
        items,
        subtotalMin: items.reduce((s, i) => s + i.cost_min, 0),
        subtotalMax: items.reduce((s, i) => s + i.cost_max, 0),
      },
    ];
  });
}

/** How much of each item to buy, summed by name. */
export function quantityByName(list: ShoppingItem[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of list)
    map[item.name] = (map[item.name] ?? 0) + item.quantity;
  return map;
}

/** The spend per guest at the middle of the range, rounded; 0 with no guests. */
export function costPerGuest(
  totalMin: number,
  totalMax: number,
  guests: number,
): number {
  if (guests === 0) return 0;
  return Math.round((totalMin + totalMax) / 2 / guests);
}

/** The safety buffer as a percentage: 1.15 → 15. */
export function bufferPercent(buffer: number): number {
  return Math.round((buffer - 1) * 100);
}

/** The list as plain text, one item a line, for the clipboard. */
export function shoppingListText(list: ShoppingItem[]): string {
  return list
    .map(
      (i) =>
        `${i.quantity} ${i.unit}  ${i.name}  (€${i.cost_min}–€${i.cost_max})`,
    )
    .join('\n');
}
