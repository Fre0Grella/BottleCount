import { afterEach, describe, expect, it } from 'vitest';
import { safeLocal, safeSession } from './safeStorage';

/** A working in-memory Storage. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const original = {
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
  sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
};

function install(
  name: 'localStorage' | 'sessionStorage',
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      ...descriptor,
    });
  } else {
    delete (globalThis as Record<string, unknown>)[name];
  }
}

afterEach(() => {
  install('localStorage', original.localStorage);
  install('sessionStorage', original.sessionStorage);
});

describe('with working storage', () => {
  it('stores, reads and forgets', () => {
    install('localStorage', { value: memoryStorage() });
    expect(safeLocal.set('k', 'v')).toBe(true);
    expect(safeLocal.get('k')).toBe('v');
    safeLocal.remove('k');
    expect(safeLocal.get('k')).toBeNull();
  });

  it('round-trips JSON, and treats garbage as a miss', () => {
    const storage = memoryStorage();
    install('localStorage', { value: storage });
    expect(safeLocal.setJSON('j', { email: 'a@b.c' })).toBe(true);
    expect(safeLocal.getJSON('j')).toEqual({ email: 'a@b.c' });
    storage.setItem('j', '{not json');
    expect(safeLocal.getJSON('j')).toBeNull();
    expect(safeLocal.getJSON('missing')).toBeNull();
  });

  it('keeps the session area apart from the local one', () => {
    install('localStorage', { value: memoryStorage() });
    install('sessionStorage', { value: memoryStorage() });
    safeSession.set('k', 'session');
    expect(safeLocal.get('k')).toBeNull();
    expect(safeSession.get('k')).toBe('session');
  });
});

describe('with storage blocked', () => {
  it('survives the property itself throwing (site data blocked)', () => {
    install('localStorage', {
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    expect(safeLocal.get('k')).toBeNull();
    expect(safeLocal.set('k', 'v')).toBe(false);
    expect(safeLocal.getJSON('k')).toBeNull();
    expect(() => safeLocal.remove('k')).not.toThrow();
  });

  it('survives every method throwing (private window, full quota)', () => {
    const fail = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
    install('sessionStorage', {
      value: {
        ...memoryStorage(),
        getItem: fail,
        setItem: fail,
        removeItem: fail,
      },
    });
    expect(safeSession.get('k')).toBeNull();
    expect(safeSession.set('k', 'v')).toBe(false);
    expect(() => safeSession.remove('k')).not.toThrow();
  });

  it('survives there being no storage at all', () => {
    install('localStorage', undefined);
    expect(safeLocal.get('k')).toBeNull();
    expect(safeLocal.set('k', 'v')).toBe(false);
    expect(() => safeLocal.remove('k')).not.toThrow();
  });
});
