/**
 * `localStorage` and `sessionStorage` that never throw.
 *
 * Every use of them here is a convenience — a remembered guest, a cached
 * ticket, the theme — and none is worth an error page. Yet they throw in
 * ordinary browsers: a private window, blocked site data or a full quota make
 * the methods throw, and with site data blocked even *reading the property*
 * throws a SecurityError. So each call goes through here: a read that fails is
 * a miss, a write that fails is skipped.
 */
export interface SafeStorage {
  /** The stored string, or null when there is none or storage is blocked. */
  get(key: string): string | null;
  /** False when the value could not be stored. */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  /** The stored value parsed as JSON, or null when missing or not JSON. */
  getJSON(key: string): unknown;
  /** False when the value could not be stored. */
  setJSON(key: string, value: unknown): boolean;
}

function storageOn(name: 'localStorage' | 'sessionStorage'): SafeStorage {
  /** The storage area, or null where there is none (Node) or it is blocked. */
  function area(): Storage | null {
    try {
      return (
        (globalThis as Partial<Record<typeof name, Storage>>)[name] ?? null
      );
    } catch {
      return null;
    }
  }

  function get(key: string): string | null {
    try {
      return area()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function set(key: string, value: string): boolean {
    const storage = area();
    if (!storage) return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  return {
    get,
    set,
    remove(key) {
      try {
        area()?.removeItem(key);
      } catch {
        /* nothing to forget */
      }
    },
    getJSON(key) {
      const raw = get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
    setJSON(key, value) {
      return set(key, JSON.stringify(value));
    },
  };
}

export const safeLocal: SafeStorage = storageOn('localStorage');
export const safeSession: SafeStorage = storageOn('sessionStorage');
