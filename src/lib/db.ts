import Dexie, { type Table } from 'dexie';
import type { Party, Ticket, UserDataKey } from './types';

interface UserDataRow {
  key:   UserDataKey;
  value: unknown;
}

export class BottleCountDB extends Dexie {
  parties!:  Table<Party,       number>;
  tickets!:  Table<Ticket,      number>;
  userdata!: Table<UserDataRow, UserDataKey>;

  constructor() {
    super('BottleCount');

    // Version 1 — original schema
    this.version(1).stores({
      parties:  '++id, name, date, createdAt',
      tickets:  '++id, partyId, guestName, used, expiresAt',
      userdata: 'key',
    });

    // Version 2 — adds usedAt index on tickets; partyMenu + partySettings
    // are stored as plain object fields (not indexed) so no schema change
    // needed for them beyond bumping the version number.
    this.version(2).stores({
      parties:  '++id, name, date, createdAt',
      tickets:  '++id, partyId, guestName, used, expiresAt, usedAt',
      userdata: 'key',
    });
    // No .upgrade() needed: Dexie preserves all existing rows automatically.
    // New optional fields (partyMenu, partySettings) simply appear as
    // undefined on old records — fully backward compatible.
  }
}

export const db = new BottleCountDB();

// ── Generic key-value helpers ───────────────────────────────────────────────

export async function getKey<T>(key: UserDataKey, fallback: T): Promise<T> {
  const row = await db.userdata.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setKey<T>(key: UserDataKey, value: T): Promise<void> {
  await db.userdata.put({ key, value });
}
