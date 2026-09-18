import { describe, expect, it } from 'vitest';
import { apply, diff, squash, type JsonRecord } from './patch';

describe('diff', () => {
  it('reports nothing when nothing changed', () => {
    // Callers skip the write on null. An empty patch would still bump the
    // version and wake every other client for no reason.
    expect(diff({ a: 1 }, { a: 1 })).toBeNull();
  });

  it('is not fooled by key order', () => {
    expect(diff({ a: 1, b: 2 }, { b: 2, a: 1 })).toBeNull();
  });

  it('carries only the field that moved', () => {
    const before = { settings: { guests: 40, ticket_price: 15 } };
    const after = { settings: { guests: 60, ticket_price: 15 } };

    expect(diff(before, after)).toEqual({ settings: { guests: 60 } });
  });

  it('turns a removed key into an explicit null', () => {
    // Removing a spirit has to travel, or the other organiser keeps buying it.
    const before = { menu: { Vodka: { pct: 1 }, Gin: { pct: 0 } } };
    const after = { menu: { Vodka: { pct: 1 } } };

    expect(diff(before, after)).toEqual({ menu: { Gin: null } });
  });

  it('replaces an array wholesale rather than merging it', () => {
    expect(diff({ xs: [1, 2] }, { xs: [1, 3] })).toEqual({ xs: [1, 3] });
  });

  it('descends several levels without dragging siblings along', () => {
    const before = {
      menu: {
        Vodka: { macro_pct: 0.5, spirits: { Absolut: { pct: 1 } } },
        Beer: { macro_pct: 0.5 },
      },
    };
    const after = {
      menu: {
        Vodka: { macro_pct: 0.5, spirits: { Absolut: { pct: 0.7 } } },
        Beer: { macro_pct: 0.5 },
      },
    };

    expect(diff(before, after)).toEqual({
      menu: { Vodka: { spirits: { Absolut: { pct: 0.7 } } } },
    });
  });
});

describe('apply', () => {
  it('merges nested objects instead of replacing them', () => {
    const target = { settings: { guests: 40, ticket_price: 15 } };

    expect(apply(target, { settings: { guests: 60 } })).toEqual({
      settings: { guests: 60, ticket_price: 15 },
    });
  });

  it('deletes on null', () => {
    expect(apply({ a: 1, b: 2 }, { b: null })).toEqual({ a: 1 });
  });

  it('does not mutate the document it was given', () => {
    const target: JsonRecord = { settings: { guests: 40 } };
    const before = structuredClone(target);

    apply(target, { settings: { guests: 60 } });

    expect(target).toEqual(before);
  });

  it('replaces a scalar with an object and vice versa', () => {
    expect(apply({ a: 1 }, { a: { b: 2 } })).toEqual({ a: { b: 2 } });
    expect(apply({ a: { b: 2 } }, { a: 1 })).toEqual({ a: 1 });
  });

  it('round-trips with diff', () => {
    const before = {
      name: 'Rooftop',
      settings: { guests: 40, buffer: 1.1 },
      menu: { Vodka: { pct: 0.6 }, Gin: { pct: 0.4 } },
    };
    const after = {
      name: 'Rooftop II',
      settings: { guests: 55, buffer: 1.1 },
      menu: { Vodka: { pct: 1 } },
    };

    const patch = diff(before, after);
    expect(patch).not.toBeNull();
    expect(apply(before, patch!)).toEqual(after);
  });
});

describe('two organisers at once', () => {
  it('keeps both edits when they touch different fields', () => {
    // This is the whole reason for patching rather than sending the document:
    // one builds the menu while the other works the numbers.
    const base = {
      settings: { guests: 40, ticket_price: 15 },
      menu: { Vodka: { pct: 1 } },
    };

    const marco = apply(
      base,
      diff(base, {
        ...base,
        settings: { ...base.settings, guests: 60 },
      })!,
    );
    const giulia = diff(base, { ...base, menu: { Vodka: { pct: 0.5 } } })!;

    const merged = apply(marco, giulia);

    expect(merged).toEqual({
      settings: { guests: 60, ticket_price: 15 },
      menu: { Vodka: { pct: 0.5 } },
    });
  });

  it('is last-writer-wins on the same field, which is what a shared box means', () => {
    const base = { settings: { guests: 40 } };

    const first = apply(base, { settings: { guests: 60 } });
    const second = apply(first, { settings: { guests: 80 } });

    expect(second).toEqual({ settings: { guests: 80 } });
  });
});

describe('squash', () => {
  it('collapses repeated nudges of one slider into a single write', () => {
    const one = { settings: { guests: 41 } };
    const two = { settings: { guests: 42 } };

    expect(squash(one, two)).toEqual({ settings: { guests: 42 } });
  });

  it('keeps edits to different fields', () => {
    expect(squash({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('lets a later delete win', () => {
    expect(
      squash({ menu: { Gin: { pct: 1 } } }, { menu: { Gin: null } }),
    ).toEqual({
      menu: { Gin: null },
    });
  });

  it('does not resurrect a subtree under an earlier delete', () => {
    expect(squash({ menu: null }, { menu: { Gin: { pct: 1 } } })).toEqual({
      menu: { Gin: { pct: 1 } },
    });
  });

  it('applies the same as the two patches applied in order', () => {
    const base = { settings: { guests: 40, buffer: 1.1 }, name: 'A' };
    const one = { settings: { guests: 50 } };
    const two = { settings: { buffer: 1.2 }, name: 'B' };

    expect(apply(base, squash(one, two))).toEqual(apply(apply(base, one), two));
  });
});
