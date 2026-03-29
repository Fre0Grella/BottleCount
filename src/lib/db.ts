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
    this.version(1).stores({
      parties:  '++id, name, date, createdAt',
      tickets:  '++id, partyId, guestName, used, expiresAt',
      userdata: 'key',
    });
  }
}

export const db = new BottleCountDB();

// ── Generic helpers ─────────────────────────────────────────────────────────

export async function getKey<T>(key: UserDataKey, fallback: T): Promise<T> {
  const row = await db.userdata.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setKey<T>(key: UserDataKey, value: T): Promise<void> {
  await db.userdata.put({ key, value });
}
