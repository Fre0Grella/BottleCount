import { describe, expect, it } from 'vitest';
import { formatEuro, formatEuroRange, segColor, venueWhere } from './display';

describe('formatEuro', () => {
  it('rounds to whole euros by default', () => {
    expect(formatEuro(41.6)).toBe('€42');
    expect(formatEuro(-3.2)).toBe('€-3');
  });

  it('shows cents when asked to', () => {
    expect(formatEuro(4, 'always')).toBe('€4.00');
    expect(formatEuro(4.5, 'always')).toBe('€4.50');
  });

  it('shows cents only when there are any on auto', () => {
    expect(formatEuro(15, 'auto')).toBe('€15');
    expect(formatEuro(12.5, 'auto')).toBe('€12.50');
  });
});

describe('formatEuroRange', () => {
  it('prints both ends', () => {
    expect(formatEuroRange(1, 2.5, 'always')).toBe('€1.00–€2.50');
  });

  it('prints one amount when the ends agree', () => {
    expect(formatEuroRange(3, 3, 'always')).toBe('€3.00');
    expect(formatEuroRange(3.2, 2.9)).toBe('€3');
  });
});

describe('venueWhere', () => {
  it('is place and city with a comma', () => {
    expect(venueWhere({ place: 'Rooftop', city: 'Milano' })).toBe(
      'Rooftop, Milano',
    );
  });

  it('is whichever half there is', () => {
    expect(venueWhere({ place: '', city: 'Milano' })).toBe('Milano');
    expect(venueWhere({ place: 'Rooftop', city: '' })).toBe('Rooftop');
  });

  it('is empty for no venue', () => {
    expect(venueWhere({ place: '', city: '' })).toBe('');
    expect(venueWhere(undefined)).toBe('');
  });
});

describe('segColor', () => {
  it('cycles through the five segment colours', () => {
    expect(segColor(0)).toBe('var(--seg-0)');
    expect(segColor(4)).toBe('var(--seg-4)');
    expect(segColor(7)).toBe('var(--seg-2)');
  });
});
