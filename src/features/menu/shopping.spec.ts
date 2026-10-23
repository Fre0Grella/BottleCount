import { describe, expect, it } from 'vitest';
import {
  bufferPercent,
  costPerGuest,
  quantityByName,
  shoppingGroups,
  shoppingListText,
} from './shopping';
import type { ShoppingItem } from '../../lib/types';

const item = (
  name: string,
  type: string,
  quantity: number,
  min: number,
  max: number,
): ShoppingItem => ({
  name,
  type,
  quantity,
  unit: 'btl',
  cost_min: min,
  cost_max: max,
});

const list = [
  item('Tonic Water 1L', 'mixer', 6, 6, 9),
  item('Gin 70cl', 'spirit', 3, 36, 54),
  item('Vodka 70cl', 'spirit', 2, 24, 30),
];

describe('shoppingGroups', () => {
  it('sections by type in shop order, with subtotals, skipping empty ones', () => {
    const groups = shoppingGroups(list);
    expect(groups.map((g) => g.type)).toEqual(['spirit', 'mixer']);
    expect(groups[0]).toMatchObject({ subtotalMin: 60, subtotalMax: 84 });
    expect(groups[0].items.map((i) => i.name)).toEqual([
      'Gin 70cl',
      'Vodka 70cl',
    ]);
  });
});

describe('quantityByName', () => {
  it('sums repeated names', () => {
    expect(
      quantityByName([...list, item('Gin 70cl', 'spirit', 1, 0, 0)]),
    ).toEqual({
      'Tonic Water 1L': 6,
      'Gin 70cl': 4,
      'Vodka 70cl': 2,
    });
  });
});

describe('costPerGuest', () => {
  it('takes the middle of the range per guest', () => {
    expect(costPerGuest(100, 140, 40)).toBe(3);
    expect(costPerGuest(100, 140, 0)).toBe(0);
  });
});

describe('bufferPercent', () => {
  it('turns the factor into a percentage', () => {
    expect(bufferPercent(1.15)).toBe(15);
    expect(bufferPercent(1)).toBe(0);
  });
});

describe('shoppingListText', () => {
  it('writes one item a line', () => {
    expect(shoppingListText(list.slice(0, 2))).toBe(
      '6 btl  Tonic Water 1L  (€6–€9)\n3 btl  Gin 70cl  (€36–€54)',
    );
  });
});
