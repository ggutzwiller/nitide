// TTL cache over an abstract async key-value store.
//
// `TtlCache.get` returns a wrapper object when a live entry exists — this lets
// callers distinguish a cache miss (null) from a cached `null` value (wrapped
// as `{ value: null }`), which matters for the "product not found" case that
// `matching` wants to remember.

export interface AsyncKeyValueStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface TtlEntry<T> {
  value: T;
  expiresAt: number;
}

export const DEFAULT_POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1_000; // 30 days
export const DEFAULT_NULL_TTL_MS = 24 * 60 * 60 * 1_000; // 24h

export class TtlCache {
  constructor(
    private readonly storage: AsyncKeyValueStorage,
    private readonly now: () => number = Date.now,
  ) {}

  async get<T>(key: string): Promise<{ value: T } | null> {
    const raw = await this.storage.get(key);
    if (!isTtlEntry<T>(raw)) return null;
    if (this.now() >= raw.expiresAt) {
      await this.storage.remove(key);
      return null;
    }
    return { value: raw.value };
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const entry: TtlEntry<T> = { value, expiresAt: this.now() + ttlMs };
    await this.storage.set(key, entry);
  }

  async remove(key: string): Promise<void> {
    await this.storage.remove(key);
  }

  async clear(): Promise<void> {
    await this.storage.clear();
  }
}

function isTtlEntry<T>(value: unknown): value is TtlEntry<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'expiresAt' in value &&
    typeof (value as { expiresAt: unknown }).expiresAt === 'number' &&
    'value' in value
  );
}

export function createMemoryStorage(): AsyncKeyValueStorage {
  const data = new Map<string, unknown>();
  return {
    async get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
    async clear() {
      data.clear();
    },
  };
}

// Minimal shape of `chrome.storage.local` that we need. Avoids a dependency on
// `@types/chrome` inside the core package.
interface ChromeStorageLocal {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export function createChromeLocalStorage(): AsyncKeyValueStorage {
  const api = (globalThis as unknown as { chrome?: { storage?: { local?: ChromeStorageLocal } } })
    .chrome?.storage?.local;
  if (!api) {
    throw new Error('chrome.storage.local is not available in this environment');
  }
  return {
    async get(key) {
      const bag = await api.get(key);
      return key in bag ? bag[key] : null;
    },
    async set(key, value) {
      await api.set({ [key]: value });
    },
    async remove(key) {
      await api.remove(key);
    },
    async clear() {
      await api.clear();
    },
  };
}
