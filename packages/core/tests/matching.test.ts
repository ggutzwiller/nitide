import { describe, expect, it, vi } from 'vitest';
import { TtlCache, createMemoryStorage } from '../src/cache.ts';
import type { OffClient } from '../src/off-client.ts';
import { buildCacheKey, matchProduct, normalizeTextKey } from '../src/matching.ts';
import type { Product } from '../src/types.ts';

const NUTELLA: Product = {
  ean: '3017620422003',
  name: 'Nutella',
  brand: 'Ferrero',
  nutriScore: 'e',
  greenScore: 'c',
  nova: 4,
  offUrl: 'https://world.openfoodfacts.org/product/3017620422003',
};

function fakeClient(overrides: Partial<OffClient> = {}): OffClient {
  return {
    fetchByBarcode: vi.fn(async () => null),
    searchByText: vi.fn(async () => null),
    ...overrides,
  };
}

describe('normalizeTextKey', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeTextKey('  Pâtes   Barilla  ')).toBe('pates barilla');
  });

  it('strips accents so Nestlé and Nestle collide', () => {
    expect(normalizeTextKey('Café', 'Nestlé')).toBe(normalizeTextKey('cafe', 'nestle'));
  });

  it('separates name and brand with a pipe', () => {
    expect(normalizeTextKey('pasta', 'barilla')).toBe('pasta|barilla');
  });

  it('omits brand when absent', () => {
    expect(normalizeTextKey('pasta')).toBe('pasta');
  });
});

describe('buildCacheKey', () => {
  it('prefers EAN when present', () => {
    expect(buildCacheKey({ ean: '123', name: 'x' })).toBe('ean:123');
  });

  it('falls back to a normalized text key', () => {
    expect(buildCacheKey({ name: 'Pâtes', brand: 'Barilla' })).toBe('text:pates|barilla');
  });
});

describe('matchProduct', () => {
  it('uses fetchByBarcode when an EAN is provided', async () => {
    const client = fakeClient({
      fetchByBarcode: vi.fn(async () => NUTELLA),
    });
    const cache = new TtlCache(createMemoryStorage());
    const product = await matchProduct(
      { ean: '3017620422003', name: 'Nutella' },
      { client, cache },
    );

    expect(product).toEqual(NUTELLA);
    expect(client.fetchByBarcode).toHaveBeenCalledWith('3017620422003');
    expect(client.searchByText).not.toHaveBeenCalled();
  });

  it('falls back to searchByText when no EAN is provided', async () => {
    const client = fakeClient({
      searchByText: vi.fn(async () => NUTELLA),
    });
    const cache = new TtlCache(createMemoryStorage());
    const product = await matchProduct({ name: 'Nutella', brand: 'Ferrero' }, { client, cache });

    expect(product).toEqual(NUTELLA);
    expect(client.searchByText).toHaveBeenCalledWith('Nutella', 'Ferrero');
    expect(client.fetchByBarcode).not.toHaveBeenCalled();
  });

  it('returns a cached hit without touching the client', async () => {
    const cache = new TtlCache(createMemoryStorage());
    await cache.set('ean:1', NUTELLA, 10_000);
    const client = fakeClient();

    const product = await matchProduct({ ean: '1', name: 'x' }, { client, cache });
    expect(product).toEqual(NUTELLA);
    expect(client.fetchByBarcode).not.toHaveBeenCalled();
    expect(client.searchByText).not.toHaveBeenCalled();
  });

  it('respects a cached `null` (remembers "not found")', async () => {
    const cache = new TtlCache(createMemoryStorage());
    await cache.set('ean:1', null, 10_000);
    const client = fakeClient({
      fetchByBarcode: vi.fn(async () => NUTELLA),
    });

    const product = await matchProduct({ ean: '1', name: 'x' }, { client, cache });
    expect(product).toBeNull();
    expect(client.fetchByBarcode).not.toHaveBeenCalled();
  });

  it('caches a hit with the positive TTL', async () => {
    const storage = createMemoryStorage();
    const now = vi.fn(() => 1_000);
    const cache = new TtlCache(storage, now);
    const client = fakeClient({
      fetchByBarcode: vi.fn(async () => NUTELLA),
    });

    await matchProduct(
      { ean: '1', name: 'x' },
      { client, cache, positiveTtlMs: 50_000, nullTtlMs: 5_000 },
    );

    const stored = (await storage.get('ean:1')) as { expiresAt: number; value: unknown };
    expect(stored.expiresAt).toBe(51_000);
  });

  it('caches a miss with the shorter null TTL', async () => {
    const storage = createMemoryStorage();
    const now = vi.fn(() => 1_000);
    const cache = new TtlCache(storage, now);
    const client = fakeClient({
      fetchByBarcode: vi.fn(async () => null),
    });

    await matchProduct(
      { ean: '1', name: 'x' },
      { client, cache, positiveTtlMs: 50_000, nullTtlMs: 5_000 },
    );

    const stored = (await storage.get('ean:1')) as { expiresAt: number; value: unknown };
    expect(stored.expiresAt).toBe(6_000);
    expect(stored.value).toBeNull();
  });

  it('re-queries after a cached entry expires', async () => {
    const storage = createMemoryStorage();
    const now = vi.fn(() => 1_000);
    const cache = new TtlCache(storage, now);
    const fetchByBarcode = vi.fn(async () => NUTELLA);
    const client = fakeClient({ fetchByBarcode });

    await matchProduct({ ean: '1', name: 'x' }, { client, cache, positiveTtlMs: 1_000 });
    expect(fetchByBarcode).toHaveBeenCalledTimes(1);

    now.mockReturnValue(5_000);
    await matchProduct({ ean: '1', name: 'x' }, { client, cache, positiveTtlMs: 1_000 });
    expect(fetchByBarcode).toHaveBeenCalledTimes(2);
  });
});
