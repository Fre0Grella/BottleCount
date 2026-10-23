import { describe, expect, it } from 'vitest';
import { normaliseCatalog } from './catalog';

describe('normaliseCatalog', () => {
  it('keeps well-formed ingredients and cocktails as they are', () => {
    const catalog = {
      ingredients: {
        'House Gin 70cl': {
          type: 'spirit',
          abv: 0.42,
          volume_ml: 700,
          price_min: 18,
          price_max: 22,
          custom: true,
        },
        'Ice kg': {
          type: 'extra',
          abv: 0,
          price_min: 1,
          price_max: 2,
          unit: 'kg',
        },
      },
      cocktails: {
        'House Tonic': {
          main_spirit: 'House Gin 70cl',
          category: 'Spirits',
          recipe: {
            'House Gin 70cl': { quantity: 50 },
            'Ice kg': { quantity: 0.1, unit: 'kg' },
          },
          custom: true,
        },
      },
    };
    expect(normaliseCatalog(catalog)).toEqual(catalog);
  });

  it('reads a document from before the field existed as empty', () => {
    expect(normaliseCatalog(undefined)).toEqual({
      ingredients: {},
      cocktails: {},
    });
    expect(normaliseCatalog([1, 2])).toEqual({
      ingredients: {},
      cocktails: {},
    });
  });

  it('drops entries that are not an ingredient or a cocktail', () => {
    const read = normaliseCatalog({
      ingredients: {
        'No type': { abv: 0.4, price_min: 1, price_max: 2 },
        'Bad type': { type: 'potion', abv: 0, price_min: 1, price_max: 2 },
        'No price': { type: 'mixer', abv: 0 },
        'Not finite': {
          type: 'mixer',
          abv: 0,
          price_min: Infinity,
          price_max: 2,
        },
        Fine: { type: 'mixer', abv: 0, price_min: 1, price_max: 2 },
      },
      cocktails: {
        'No main spirit': { recipe: {} },
        'Bad recipe item': {
          main_spirit: 'Fine',
          recipe: { Fine: { quantity: 'lots' }, Other: { quantity: 20 } },
        },
      },
    });
    expect(Object.keys(read.ingredients)).toEqual(['Fine']);
    expect(Object.keys(read.cocktails)).toEqual(['Bad recipe item']);
    expect(read.cocktails['Bad recipe item']?.recipe).toEqual({
      Other: { quantity: 20 },
    });
  });

  it('holds numbers to sane ranges and caps the size', () => {
    const read = normaliseCatalog({
      ingredients: {
        Strong: { type: 'spirit', abv: 7, price_min: -3, price_max: 1e9 },
        ['x'.repeat(81)]: { type: 'mixer', abv: 0, price_min: 1, price_max: 2 },
        ...Object.fromEntries(
          Array.from({ length: 400 }, (_, i) => [
            `Mixer ${i}`,
            { type: 'mixer', abv: 0, price_min: 1, price_max: 2 },
          ]),
        ),
      },
    });
    expect(read.ingredients['Strong']).toEqual({
      type: 'spirit',
      abv: 1,
      price_min: 0,
      price_max: 100_000,
    });
    expect(read.ingredients['x'.repeat(81)]).toBeUndefined();
    expect(Object.keys(read.ingredients).length).toBeLessThanOrEqual(300);
  });
});
