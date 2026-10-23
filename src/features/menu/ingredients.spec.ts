import { describe, expect, it } from 'vitest';
import {
  bottleDefaults,
  bottleFromFields,
  bottleMetaLine,
  bottleTypeFor,
  builtInEdit,
  emptyIngredientFields,
  fieldsFromIngredient,
  ingredientFromFields,
  ingredientMetaLine,
  shortName,
  typeHasAbv,
  typeHasVolume,
} from './ingredients';
import { categoryIcon } from './ingredientTypes';
import type { Ingredient } from '../../lib/types';

const gin: Ingredient = {
  type: 'spirit',
  abv: 0.4,
  volume_ml: 700,
  price_min: 12,
  price_max: 18,
};

describe('shortName', () => {
  it('drops a trailing size', () => {
    expect(shortName('Gin 70cl')).toBe('Gin');
    expect(shortName('Tonic Water 1L')).toBe('Tonic Water');
    expect(shortName('Beer 66cl')).toBe('Beer');
  });
  it('keeps a name without a numbered size', () => {
    expect(shortName('Ice kg')).toBe('Ice kg');
    expect(shortName('Disposable Cups')).toBe('Disposable Cups');
  });
});

describe('what a type has', () => {
  it('gives drinks with alcohol a strength', () => {
    expect(
      ['beer', 'wine', 'spirit'].every((t) => typeHasAbv(t as 'beer')),
    ).toBe(true);
    expect(typeHasAbv('mixer')).toBe(false);
  });
  it('gives bottles and mixers a size, extras and snacks a unit', () => {
    expect(typeHasVolume('mixer')).toBe(true);
    expect(typeHasVolume('spirit')).toBe(true);
    expect(typeHasVolume('extra')).toBe(false);
    expect(typeHasVolume('snack')).toBe(false);
  });
});

describe('ingredientMetaLine', () => {
  it('shows strength, size and price', () => {
    expect(ingredientMetaLine(gin)).toBe('40% · 700 ml · €12.00–€18.00');
  });
  it('shows the unit when there is no size, and no strength at 0', () => {
    expect(
      ingredientMetaLine({
        type: 'extra',
        abv: 0,
        unit: 'kg',
        price_min: 2,
        price_max: 2,
      }),
    ).toBe('kg · €2.00');
  });
});

describe('ingredient fields', () => {
  it('round-trips an ingredient', () => {
    const f = fieldsFromIngredient('Gin 70cl', gin);
    expect(f).toEqual({
      name: 'Gin 70cl',
      type: 'spirit',
      abv: '40',
      vol: '700',
      unit: '',
      priceMin: '12',
      priceMax: '18',
    });
    expect(ingredientFromFields(f)).toEqual({ ...gin, unit: undefined });
  });
  it('keeps only the fields the type has', () => {
    const f = {
      ...emptyIngredientFields('extra'),
      abv: '40',
      vol: '700',
      unit: ' kg ',
      priceMin: 'x',
    };
    expect(ingredientFromFields(f)).toEqual({
      type: 'extra',
      abv: 0,
      volume_ml: undefined,
      unit: 'kg',
      price_min: 0,
      price_max: 0,
    });
  });
});

describe('builtInEdit', () => {
  it('overrides the price when only the price changed', () => {
    expect(
      builtInEdit(gin, 'Gin 70cl', { ...gin, price_min: 9 }, 'Gin 70cl'),
    ).toBe('price-override');
  });
  it('replaces the built-in when anything else changed', () => {
    expect(
      builtInEdit(gin, 'Gin 70cl', { ...gin, abv: 0.42 }, 'Gin 70cl'),
    ).toBe('replace');
    expect(
      builtInEdit(gin, 'Gin 70cl', { ...gin, volume_ml: 1000 }, 'Gin 70cl'),
    ).toBe('replace');
    expect(builtInEdit(gin, 'Gin 70cl', gin, 'Gin 1L')).toBe('replace');
  });
});

describe('bottles for a category', () => {
  it('stocks Beer and Wine with their own type, the rest with spirits', () => {
    expect(bottleTypeFor('Beer')).toBe('beer');
    expect(bottleTypeFor('Wine')).toBe('wine');
    expect(bottleTypeFor('Spirits')).toBe('spirit');
  });
  it('starts a new bottle at the usual strength and size', () => {
    expect(bottleDefaults('beer')).toMatchObject({ abv: '5', vol: '660' });
    expect(bottleDefaults('wine')).toMatchObject({ abv: '12', vol: '750' });
    expect(bottleDefaults('spirit')).toMatchObject({ abv: '40', vol: '700' });
  });
  it('describes a bottle by strength and price', () => {
    expect(bottleMetaLine(gin)).toBe('40% ABV · €12.00–€18.00');
    expect(bottleMetaLine({ ...gin, abv: 0 })).toBe('€12.00–€18.00');
  });
  it('reads the custom-bottle form', () => {
    expect(
      bottleFromFields('spirit', {
        name: 'Mezcal',
        abv: '42.5',
        vol: '700',
        priceMin: '30',
        priceMax: '',
      }),
    ).toEqual({
      type: 'spirit',
      abv: 0.425,
      volume_ml: 700,
      price_min: 30,
      price_max: 0,
    });
  });
});

describe('categoryIcon', () => {
  it('draws beer, wine, and a bottle for the rest', () => {
    expect(categoryIcon('Beer')).toBe('beer');
    expect(categoryIcon('Red wine')).toBe('wine');
    expect(categoryIcon('Spirits')).toBe('bottle');
  });
});
