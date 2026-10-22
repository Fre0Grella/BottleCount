import Dexie, { type DexieOptions, type Table } from 'dexie';
import { upgradeParty } from '../features/party/partyDefaults';
import type { Party, UserDataKey } from './types';

interface UserDataRow {
  key: UserDataKey;
  value: unknown;
}

export class BottleCountDB extends Dexie {
  parties!: Table<Party, number>;
  userdata!: Table<UserDataRow, UserDataKey>;

  /** Both arguments are for tests, which open a fake IndexedDB by another name. */
  constructor(name = 'BottleCount', options?: DexieOptions) {
    super(name, options);

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

    // version(3) expands the Party shape to include venue, menu, locks,
    // checked, invites, etc. (v2 redesign). Indexes are unchanged — the
    // party object is stored as a single embedded document.
    this.version(3).stores({
      parties: '++id, name, date, createdAt',
      tickets: '++id, partyId, guestName, used, expiresAt',
      userdata: 'key',
    });

    // version(4) brings every stored party up to the current shape once, here,
    // instead of on every load: fields added since it was saved, the renamed
    // invite statuses, and the ticket codes of local guests saved before codes
    // were stored (#47). It also drops `tickets`, which nothing has read since
    // tickets moved onto the party's guests.
    //
    // A party that fails to upgrade is left as it is rather than failing the
    // upgrade: a throw here would abort the open, and the app would not start
    // on that phone again. The store's load runs the same upgrade on it.
    this.version(4)
      .stores({
        parties: '++id, name, date, createdAt',
        tickets: null,
        userdata: 'key',
      })
      .upgrade((tx) =>
        tx
          .table<Party, number>('parties')
          .toCollection()
          .modify((party) => {
            try {
              const upgraded = structuredClone(party);
              upgradeParty(upgraded);
              Object.assign(party, upgraded);
            } catch (err) {
              console.error('Party left for the next load to upgrade', err);
            }
          }),
      );
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
