import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { BottleCountDB } from './db';
import { upgradeParty } from '../features/party/partyDefaults';
import { ticketCode } from '../features/tickets/ticket';
import type { Party } from './types';

/**
 * The upgrade to version 4 rewrites every party on every phone that has the
 * app, once, and cannot be taken back. These tests open a database as version
 * 3 left it — the shapes real phones hold — with the new code.
 */

const fake = { indexedDB, IDBKeyRange };
let n = 0;
let name = '';

/** The database exactly as the app declared it up to version 3. */
class Version3 extends Dexie {
  constructor(dbName: string) {
    super(dbName, fake);
    this.version(1).stores({
      parties: '++id, name, date, createdAt',
      tickets: '++id, partyId, guestName, used, expiresAt',
    });
    this.version(2).stores({
      parties: '++id, name, date, createdAt',
      tickets: '++id, partyId, guestName, used, expiresAt',
      userdata: 'key',
    });
    this.version(3).stores({
      parties: '++id, name, date, createdAt',
      tickets: '++id, partyId, guestName, used, expiresAt',
      userdata: 'key',
    });
  }
}

/** A party as the planner saved it before most of today's fields existed. */
function oldParty(over: Record<string, unknown> = {}) {
  return {
    name: 'Rooftop',
    date: '2026-11-14',
    createdAt: '2026-01-02T10:00:00.000Z',
    cover: 2,
    venue: { place: 'Roof', city: 'Bologna', time: '22:00' },
    settings: {
      guests: 80,
      ticket_price: 10,
      venue_cost: 100,
      equipment_cost: 0,
      alcohol_ml_per_person: 75,
      buffer: 1.2,
    },
    menu: { Beer: { macro_pct: 1, spirits: { 'Beer 66cl': { pct: 1 } } } },
    locks: {},
    checked: { 'Beer 66cl': true },
    allowForward: true,
    invites: [
      {
        id: 1,
        name: 'Anna',
        status: 'accepted',
        depth: 0,
        referrer: null,
        used: false,
      },
      {
        id: 2,
        name: 'Marco Rossi',
        status: 'pending',
        depth: 0,
        referrer: null,
        used: false,
      },
      {
        id: 3,
        name: 'Zoë',
        status: 'declined',
        depth: 0,
        referrer: null,
        used: true,
        usedAt: '22:15',
      },
      // Already stored: kept as it is.
      {
        id: 4,
        name: 'Bea',
        status: 'confirmed',
        depth: 0,
        referrer: null,
        used: false,
        ticketCode: 'ABCDE',
      },
      // From the link: the server's code, which the next sync fills in.
      {
        id: 5,
        name: 'Carla',
        status: 'confirmed',
        depth: 1,
        referrer: 'Anna',
        used: false,
        remoteId: 'r-5',
      },
    ],
    ...over,
  };
}

async function seedVersion3(
  rows: Record<string, unknown>[],
): Promise<number[]> {
  const old = new Version3(name);
  const ids: number[] = [];
  for (const row of rows)
    ids.push((await old.table('parties').add(row)) as number);
  await old.table('tickets').bulkAdd([
    {
      partyId: ids[0],
      guestName: 'Anna',
      used: false,
      expiresAt: '2026-11-15T06:00',
    },
    {
      partyId: ids[0],
      guestName: 'Zoë',
      used: true,
      expiresAt: '2026-11-15T06:00',
    },
  ]);
  await old.table('userdata').put({ key: 'theme', value: 'light' });
  old.close();
  return ids;
}

function openNew(): BottleCountDB {
  return new BottleCountDB(name, fake);
}

afterEach(async () => {
  await new Dexie(name, fake).delete();
});

describe('the version 4 upgrade', () => {
  it('keeps every local guest on the code already on their ticket', async () => {
    name = `upgrade-${++n}`;
    // Party id 1 and 3; the codes are the ones the old code printed for them.
    const [first] = await seedVersion3([
      oldParty(),
      oldParty({ name: 'Garden' }),
      oldParty(),
    ]);
    const before = new Version3(name);
    const stored = (await before.table('parties').toArray()) as Party[];
    const printed = stored.map((p) =>
      p.invites.map((i) => ticketCode(p, i.id)),
    );
    before.close();
    expect(printed[2].slice(0, 3)).toEqual(['K9NFJ', 'H3HET', 'ZQRMT']);

    const db = openNew();
    const parties = await db.parties.toArray();
    expect(parties).toHaveLength(3);
    for (const [k, p] of parties.entries()) {
      expect(p.invites.map((i) => ticketCode(p, i.id))).toEqual(printed[k]);
      expect(p.invites.slice(0, 3).map((i) => i.ticketCode)).toEqual(
        printed[k].slice(0, 3),
      );
      expect(p.invites[3].ticketCode).toBe('ABCDE');
      expect(p.invites[4].ticketCode).toBeUndefined();
    }

    // Stored now, so renaming no longer changes it.
    const renamed = parties[0];
    renamed.invites[0].name = 'Anna Bianchi';
    expect(ticketCode(renamed, 1)).toBe(printed[0][0]);
    expect(first).toBe(1);
    db.close();
  });

  it('brings every party up to the current shape', async () => {
    name = `upgrade-${++n}`;
    await seedVersion3([oldParty()]);

    const db = openNew();
    const [p] = await db.parties.toArray();
    expect(p.settings.max_capacity).toBeNull();
    expect(p.settings.guests).toBe(80);
    expect(p.includeSnacks).toBe(true);
    expect(p.barManaged).toBe(true);
    expect(p.payment).toEqual({
      paypal: '',
      satispay: '',
      revolut: '',
      bank_holder: '',
      bank_iban: '',
    });
    expect(p.publication).toBeNull();
    expect(p.invites.map((i) => i.status)).toEqual([
      'confirmed',
      'opened',
      'declined',
      'confirmed',
      'confirmed',
    ]);
    expect(p.checked).toEqual({ 'Beer 66cl': true });
    expect(p.cover).toBe(2);
    db.close();
  });

  it('leaves what a newer party already holds alone', async () => {
    name = `upgrade-${++n}`;
    const current = {
      ...oldParty(),
      includeSnacks: false,
      barManaged: false,
      payment: {
        paypal: 'marcog',
        satispay: '',
        revolut: '',
        bank_holder: '',
        bank_iban: '',
      },
      publication: {
        remoteId: 'p1',
        version: 7,
        slug: null,
        rootToken: null,
        publishedAt: 'x',
      },
      settings: { ...oldParty().settings, max_capacity: 120 },
    };
    await seedVersion3([current]);

    const db = openNew();
    const [p] = await db.parties.toArray();
    expect(p.includeSnacks).toBe(false);
    expect(p.barManaged).toBe(false);
    expect(p.payment.paypal).toBe('marcog');
    expect(p.publication?.remoteId).toBe('p1');
    expect(p.settings.max_capacity).toBe(120);
    db.close();
  });

  it('drops the tickets table and keeps userdata', async () => {
    name = `upgrade-${++n}`;
    await seedVersion3([oldParty()]);

    const db = openNew();
    await db.open();
    expect(db.verno).toBe(4);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'parties',
      'userdata',
    ]);
    expect(Array.from(db.backendDB().objectStoreNames).sort()).toEqual([
      'parties',
      'userdata',
    ]);
    expect(await db.userdata.get('theme')).toEqual({
      key: 'theme',
      value: 'light',
    });
    db.close();
  });

  it('still opens with a party too broken to upgrade, and upgrades the rest', async () => {
    name = `upgrade-${++n}`;
    await seedVersion3([
      {
        name: 'Before the redesign',
        date: '2025-06-01',
        createdAt: '2025-05-01',
      },
      { ...oldParty(), invites: [null] },
      oldParty(),
    ]);

    const db = openNew();
    const parties = await db.parties.toArray();
    expect(parties).toHaveLength(3);
    // Missing everything: given the new-party defaults, so it opens.
    expect(parties[0].name).toBe('Before the redesign');
    expect(parties[0].settings.guests).toBe(40);
    expect(parties[0].invites).toEqual([]);
    // Throws on its null guest: left as it was, for the load to try again.
    expect(parties[1].includeSnacks).toBeUndefined();
    // The one after it is still upgraded.
    expect(parties[2].includeSnacks).toBe(true);
    db.close();
  });

  it('opens an empty, brand-new database', async () => {
    name = `upgrade-${++n}`;
    const db = openNew();
    await db.parties.add({ name: 'x' } as Party);
    expect(await db.parties.count()).toBe(1);
    db.close();
  });
});

describe('upgradeParty', () => {
  it('reports a change once and nothing on a second run', () => {
    const p = oldParty({ id: 9 }) as unknown as Party;
    expect(upgradeParty(p)).toBe(true);
    const once = structuredClone(p);
    expect(upgradeParty(p)).toBe(false);
    expect(p).toEqual(once);
  });
});
