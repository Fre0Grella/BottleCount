import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { state } from '../../store/storeState';
import { doorTally, recordCheckIn, rejection, showScanResult } from './door';
import type { DoorEntry } from './ticket';
import type { Invite, Party } from '../../lib/types';

function guest(over: Partial<Invite> & Pick<Invite, 'id' | 'name'>): Invite {
  return {
    status: 'confirmed',
    depth: 0,
    referrer: null,
    used: false,
    ...over,
  };
}

const scan: DoorEntry = {
  kind: 'scan',
  check: { ok: false, reason: 'malformed' },
};
const typed: DoorEntry = { kind: 'typed', code: 'AB23C', name: 'Ada' };
const ada = guest({ id: 1, name: 'Ada', usedAt: '2026-11-14T21:05:00.000Z' });

describe('rejection', () => {
  it('tells a forged QR from a mistyped code', () => {
    expect(rejection(scan, { ok: false, reason: 'malformed' })).toEqual({
      name: 'Forged or invalid ticket',
      sub: "That QR isn't a BottleCount ticket",
    });
    expect(rejection(typed, { ok: false, reason: 'malformed' })).toEqual({
      name: 'Invalid code',
      sub: 'A ticket code is five letters and numbers',
    });
  });

  it('names the guest a scanned ticket carries when it matches no one', () => {
    expect(
      rejection(scan, { ok: false, reason: 'unknown_code', guestName: 'Bo' }),
    ).toEqual({ name: 'Bo', sub: 'Not found on the confirmed guest list' });
    expect(rejection(scan, { ok: false, reason: 'unknown_code' }).name).toBe(
      'Unknown guest',
    );
    expect(rejection(typed, { ok: false, reason: 'unknown_code' })).toEqual({
      name: 'Unknown code',
      sub: 'No ticket on this party has that code',
    });
  });

  it('never names the guest a mismatched code belongs to', () => {
    const r = rejection(typed, {
      ok: false,
      reason: 'name_mismatch',
      invite: ada,
    });
    expect(r.name).toBe('Name does not match');
    expect(JSON.stringify(r)).not.toContain('Ada');
  });

  it('says why a known guest is turned away', () => {
    const say = (reason: 'wrong_party' | 'expired' | 'not_coming' | 'unpaid') =>
      rejection(scan, { ok: false, reason, invite: ada });
    expect(say('wrong_party')).toEqual({
      name: 'Ada',
      sub: 'Ticket is for another party',
    });
    expect(say('expired').sub).toBe('This ticket has expired');
    expect(say('not_coming').sub).toBe("They haven't confirmed they're coming");
    expect(say('unpaid').sub).toMatch(/^Hasn't paid yet/);
    expect(rejection(scan, { ok: false, reason: 'bad_signature' }).sub).toMatch(
      /counterfeit/,
    );
    expect(rejection(typed, { ok: false, reason: 'name_missing' }).name).toBe(
      'Name needed',
    );
  });

  it('says when an already-used ticket came in', () => {
    const r = rejection(scan, {
      ok: false,
      reason: 'already_used',
      invite: ada,
    });
    expect(r.name).toBe('Ada');
    expect(r.sub).toMatch(
      /^Already scanned at \d\d:\d\d — do not let in again$/,
    );
    expect(
      rejection(scan, {
        ok: false,
        reason: 'already_used',
        invite: { ...ada, usedAt: undefined },
      }).sub,
    ).toBe('Already scanned at ? — do not let in again');
  });
});

describe('doorTally', () => {
  it('counts confirmed guests and those of them inside', () => {
    const party = {
      invites: [
        guest({ id: 1, name: 'A', used: true }),
        guest({ id: 2, name: 'B' }),
        guest({ id: 3, name: 'C', status: 'declined', used: true }),
        guest({ id: 4, name: 'D', status: 'opened' }),
      ],
    } as unknown as Party;
    expect(doorTally(party)).toEqual({ inside: 1, confirmed: 2 });
  });

  it('is zero with no party', () => {
    expect(doorTally(null)).toEqual({ inside: 0, confirmed: 0 });
  });
});

describe('door actions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.scanResult = null;
    state.scanHistory = [];
  });
  afterEach(() => vi.useRealTimers());

  it('shows a verdict for two seconds', () => {
    showScanResult({ ok: true, name: 'Ada' });
    expect(state.scanResult).toEqual({ ok: true, name: 'Ada' });
    vi.advanceTimersByTime(1999);
    expect(state.scanResult).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(state.scanResult).toBeNull();
  });

  it('gives a new verdict its full two seconds', () => {
    showScanResult({ ok: true, name: 'Ada' });
    vi.advanceTimersByTime(1500);
    showScanResult({ ok: false, name: 'Bo', sub: 'x' });
    vi.advanceTimersByTime(1500);
    expect(state.scanResult?.name).toBe('Bo');
    vi.advanceTimersByTime(500);
    expect(state.scanResult).toBeNull();
  });

  it('keeps the six latest check-ins, newest first', () => {
    for (let i = 1; i <= 8; i++) recordCheckIn(`G${i}`, `21:0${i}:00`);
    expect(state.scanHistory.map((h) => h.name)).toEqual([
      'G8',
      'G7',
      'G6',
      'G5',
      'G4',
      'G3',
    ]);
    expect(state.scanHistory[0]).toEqual({ name: 'G8', time: '21:08:00' });
  });
});
