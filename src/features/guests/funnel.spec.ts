import { describe, expect, it } from 'vitest';
import {
  funnelBar,
  funnelGroups,
  initial,
  isNameless,
  percentOf,
  referrerFirst,
  rowAvatarOpacity,
  spreadAvatarOpacity,
  spreadFactor,
  venueFeeLine,
} from './funnel';
import type { Invite } from '../../lib/types';

function guest(over: Partial<Invite> = {}): Invite {
  return {
    id: 1,
    name: 'Anna',
    status: 'confirmed',
    depth: 0,
    referrer: null,
    used: false,
    ...over,
  };
}

describe('percentOf', () => {
  it('is a share of the whole, kept within 0–100', () => {
    expect(percentOf(1, 4)).toBe(25);
    expect(percentOf(9, 4)).toBe(100);
    expect(percentOf(-1, 4)).toBe(0);
  });

  it('is 0 of nothing rather than NaN', () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(3, 0)).toBe(0);
  });
});

describe('funnelGroups', () => {
  it('sorts guests into columns and tiers and counts the door and payments', () => {
    const g = funnelGroups([
      guest({ id: 1, used: true, paidAt: '2026-10-20T10:00:00Z' }),
      guest({ id: 2, depth: 1, referrer: 'Anna' }),
      guest({ id: 3, status: 'opened', name: '' }),
      guest({ id: 4, status: 'declined', depth: 2 }),
    ]);
    expect(g.confirmed.map((i) => i.id)).toEqual([1, 2]);
    expect(g.opened.map((i) => i.id)).toEqual([3]);
    expect(g.declined.map((i) => i.id)).toEqual([4]);
    expect(g.direct.map((i) => i.id)).toEqual([1, 3]);
    expect(g.viral.map((i) => i.id)).toEqual([2, 4]);
    expect(g.checkedIn).toBe(1);
    expect(g.paid).toBe(1);
  });

  it('counts only confirmed guests as checked in or paid', () => {
    const g = funnelGroups([
      guest({ status: 'declined', used: true, paidAt: '2026-10-20T10:00:00Z' }),
    ]);
    expect(g.checkedIn).toBe(0);
    expect(g.paid).toBe(0);
  });
});

describe('funnelBar', () => {
  it('without a cap, scales to the expected headcount with no second segment', () => {
    expect(funnelBar(10, 5, 40, null)).toEqual({
      within: 25,
      over: 0,
      maybe: 12.5,
      marker: 100,
    });
  });

  it('with a cap, scales to the cap and splits confirmed at expected', () => {
    expect(funnelBar(45, 0, 40, 50)).toEqual({
      within: 80,
      over: 10,
      maybe: 0,
      marker: 80,
    });
  });

  it('never fills past the cap, however many confirmed', () => {
    const bar = funnelBar(70, 3, 40, 50);
    expect(bar.within + bar.over).toBe(100);
    expect(bar.maybe).toBe(0);
  });

  it('fits the maybes into the room confirmed guests leave', () => {
    const bar = funnelBar(30, 30, 40, null);
    expect(bar.within).toBe(75);
    expect(bar.maybe).toBe(25);
  });

  it('is empty with nobody confirmed', () => {
    expect(funnelBar(0, 0, 40, 50)).toEqual({
      within: 0,
      over: 0,
      maybe: 0,
      marker: 80,
    });
  });
});

describe('spreadFactor', () => {
  it('is people reached per direct invite, to one decimal', () => {
    expect(spreadFactor(6, 4)).toBe('1.5×');
  });

  it('counts no direct invites as one', () => {
    expect(spreadFactor(0, 0)).toBe('0.0×');
    expect(spreadFactor(3, 0)).toBe('3.0×');
  });
});

describe('venueFeeLine', () => {
  const settings = { venue_fee_per_person: 5 };

  it('is nothing when the venue charges no fee', () => {
    expect(venueFeeLine({}, true, 10, 4)).toBeNull();
  });

  it('counts guests marked paid on a party guests pay for', () => {
    expect(venueFeeLine(settings, true, 10, 4)).toEqual({
      guests: 4,
      who: 'paid',
      fee: 5,
      total: 20,
    });
  });

  it('counts guests coming on a free party', () => {
    expect(venueFeeLine(settings, false, 10, 4)).toEqual({
      guests: 10,
      who: 'coming',
      fee: 5,
      total: 50,
    });
  });
});

describe('avatars and names', () => {
  it('fades an avatar until the guest answers yes', () => {
    expect(spreadAvatarOpacity('confirmed')).toBe(1);
    expect(spreadAvatarOpacity('opened')).toBe(0.55);
    expect(spreadAvatarOpacity('declined')).toBe(0.35);
    expect(rowAvatarOpacity('confirmed')).toBe(1);
    expect(rowAvatarOpacity('opened')).toBe(0.7);
    expect(rowAvatarOpacity('declined')).toBe(0.45);
  });

  it('puts the first letter on the avatar, or ? for no name', () => {
    expect(initial('  sofia')).toBe('S');
    expect(initial('   ')).toBe('?');
  });

  it('knows a guest who has not given a name', () => {
    expect(isNameless({ name: ' ' })).toBe(true);
    expect(isNameless({ name: 'Bea' })).toBe(false);
  });

  it('names a referrer by their first name', () => {
    expect(referrerFirst(' Marco Bianchi')).toBe('Marco');
    expect(referrerFirst(null)).toBe('');
  });
});
