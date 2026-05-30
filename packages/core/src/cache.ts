// Minimal TTL cache over an injectable async key/value store. Rebuilt for M4
// (the M3 version was deleted with the OFF API path). Stores `{ value, expiresAt }`.
export interface AsyncKeyValueStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

interface TtlEntry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache {
  constructor(
    private readonly storage: AsyncKeyValueStorage,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const entry = (await this.storage.get(key)) as TtlEntry<T> | undefined;
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) return undefined;
    return entry.value;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const entry: TtlEntry<T> = { value, expiresAt: this.now() + ttlMs };
    await this.storage.set(key, entry);
  }
}

export function createMemoryStorage(): AsyncKeyValueStorage {
  const map = new Map<string, unknown>();
  return {
    get: (key) => Promise.resolve(map.get(key)),
    set: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}

// Minimal shape of `chrome.storage.local` we need. Avoids a dependency on
// `@types/chrome` inside the core package.
interface ChromeStorageLocal {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
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
      return key in bag ? bag[key] : undefined;
    },
    async set(key, value) {
      await api.set({ [key]: value });
    },
  };
}
