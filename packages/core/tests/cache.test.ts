import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NULL_TTL_MS,
  DEFAULT_POSITIVE_TTL_MS,
  TtlCache,
  createChromeLocalStorage,
  createMemoryStorage,
} from '../src/cache.ts';

describe('TtlCache', () => {
  it('returns null on a miss', async () => {
    const cache = new TtlCache(createMemoryStorage());
    expect(await cache.get('missing')).toBeNull();
  });

  it('returns the stored value wrapped before TTL expires', async () => {
    const now = vi.fn(() => 1_000);
    const cache = new TtlCache(createMemoryStorage(), now);
    await cache.set('k', { hello: 'world' }, 10_000);

    now.mockReturnValue(5_000);
    const hit = await cache.get<{ hello: string }>('k');
    expect(hit).toEqual({ value: { hello: 'world' } });
  });

  it('treats a stored `null` as a distinct cache hit', async () => {
    const cache = new TtlCache(createMemoryStorage());
    await cache.set('k', null, 10_000);
    const hit = await cache.get<null>('k');
    expect(hit).toEqual({ value: null });
  });

  it('returns null and evicts the entry after TTL expires', async () => {
    const storage = createMemoryStorage();
    const now = vi.fn(() => 1_000);
    const cache = new TtlCache(storage, now);
    await cache.set('k', 'v', 10_000);

    now.mockReturnValue(12_000);
    expect(await cache.get('k')).toBeNull();
    // Evicted from underlying storage.
    expect(await storage.get('k')).toBeNull();
  });

  it('supports remove and clear', async () => {
    const cache = new TtlCache(createMemoryStorage());
    await cache.set('a', 1, 1_000);
    await cache.set('b', 2, 1_000);
    await cache.remove('a');
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).not.toBeNull();

    await cache.clear();
    expect(await cache.get('b')).toBeNull();
  });

  it('ignores legacy entries with the wrong shape', async () => {
    const storage = createMemoryStorage();
    await storage.set('legacy', { foo: 'bar' });
    const cache = new TtlCache(storage);
    expect(await cache.get('legacy')).toBeNull();
  });

  it('exposes sensible default TTL constants', () => {
    expect(DEFAULT_POSITIVE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1_000);
    expect(DEFAULT_NULL_TTL_MS).toBe(24 * 60 * 60 * 1_000);
  });
});

describe('createMemoryStorage', () => {
  it('implements the full interface', async () => {
    const storage = createMemoryStorage();
    expect(await storage.get('nope')).toBeNull();
    await storage.set('a', 1);
    expect(await storage.get('a')).toBe(1);
    await storage.remove('a');
    expect(await storage.get('a')).toBeNull();

    await storage.set('a', 1);
    await storage.set('b', 2);
    await storage.clear();
    expect(await storage.get('a')).toBeNull();
    expect(await storage.get('b')).toBeNull();
  });
});

describe('createChromeLocalStorage', () => {
  const globalsBackup = { chrome: (globalThis as { chrome?: unknown }).chrome };

  beforeEach(() => {
    (globalThis as { chrome?: unknown }).chrome = globalsBackup.chrome;
  });

  it('throws when chrome.storage.local is unavailable', () => {
    delete (globalThis as { chrome?: unknown }).chrome;
    expect(() => createChromeLocalStorage()).toThrow(/chrome\.storage\.local/);
  });

  it('delegates to chrome.storage.local when present', async () => {
    const store = new Map<string, unknown>();
    const fakeLocal = {
      get: vi.fn(async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {})),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
      }),
      remove: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      clear: vi.fn(async () => {
        store.clear();
      }),
    };
    (globalThis as unknown as { chrome: { storage: { local: typeof fakeLocal } } }).chrome = {
      storage: { local: fakeLocal },
    };

    const storage = createChromeLocalStorage();
    await storage.set('k', 'v');
    expect(fakeLocal.set).toHaveBeenCalledWith({ k: 'v' });
    expect(await storage.get('k')).toBe('v');
    expect(await storage.get('missing')).toBeNull();
    await storage.remove('k');
    expect(fakeLocal.remove).toHaveBeenCalledWith('k');
    await storage.clear();
    expect(fakeLocal.clear).toHaveBeenCalled();
  });
});
