import Dexie, { type Table } from 'dexie';
import type { Party, Ticket, UserDataKey } from './types';

interface UserDataRow {
  key: UserDataKey;
  value: unknown;
}

export class BottleCountDB extends Dexie {
  parties!: Table<Party, number>;
  tickets!: Table<Ticket, number>;
  userdata!: Table<UserDataRow, UserDataKey>;

  constructor() {
    super('BottleCount');

    // version(1) had only parties + tickets (no userdata table).
    // Keep it declared so Dexie knows the baseline schema and won't
    // wipe existing data when upgrading users who opened the DB before
    // userdata was added.
    this.version(1).stores({
      parties: '++id, name, date, createdAt',
      tickets: '++id, partyId, guestName, used, expiresAt',
    });

    // version(2) adds the userdata key-value store.
    // All three tables must be listed even if parties/tickets are unchanged —
    // Dexie uses the highest-version schema as the live definition.
    this.version(2).stores({
      parties: '++id, name, date, createdAt',
      tickets: '++id, partyId, guestName, used, expiresAt',
      userdata: 'key',
    });
  }
}

export const db = new BottleCountDB();

// ── Generic key-value helpers ───────────────────────────────────────────────

export async function getKey<T>(key: UserDataKey, fallback: T): Promise<T> {
  const row = await db.userdata.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setKey<T>(key: UserDataKey, value: T): Promise<void> {
  // Guard: IndexedDB cannot structured-clone a CryptoKey object.
  // Callers must export to JWK before storing (crypto.ts already does this).
  // This check catches accidental misuse during development.
  if (
    typeof value === 'object' &&
    value !== null &&
    (value as object).constructor?.name === 'CryptoKey'
  ) {
    throw new TypeError(
      `setKey("${key}"): CryptoKey is not serialisable. ` +
        'Export to JWK with crypto.subtle.exportKey("jwk", key) before storing.',
    );
  }
  await db.userdata.put({ key, value });
}
