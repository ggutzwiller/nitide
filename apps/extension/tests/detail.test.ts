import { describe, expect, it, vi } from 'vitest';
import { OffTransientError, createMemoryStorage, type ProductDetail } from '@nitide/core';
import { createDetailResolver } from '../src/background/detail.ts';

const DETAIL: ProductDetail = {
  ean: '3560070546879',
  name: 'Pâtes',
  brand: 'Carrefour',
  nutriScore: 'a',
  greenScore: 'b',
  nova: 1,
  offUrl: 'https://world.openfoodfacts.org/product/3560070546879',
};

function client(
  over: Partial<{ fetchProductDetail: (ean: string) => Promise<ProductDetail | null> }> = {},
) {
  return { fetchProductDetail: vi.fn(async () => DETAIL), ...over };
}

describe('createDetailResolver', () => {
  it('returns found and caches it (second call skips the client)', async () => {
    const c = client();
    const r = createDetailResolver({ client: c, storage: createMemoryStorage() });
    expect((await r.resolve('3560070546879')).status).toBe('found');
    await r.resolve('3560070546879');
    expect(c.fetchProductDetail).toHaveBeenCalledTimes(1);
  });

  it('returns not-found and caches it', async () => {
    const c = client({ fetchProductDetail: vi.fn(async () => null) });
    const r = createDetailResolver({ client: c, storage: createMemoryStorage() });
    expect((await r.resolve('0000000000000')).status).toBe('not-found');
    await r.resolve('0000000000000');
    expect(c.fetchProductDetail).toHaveBeenCalledTimes(1);
  });

  it('returns error and does NOT cache it (next call retries)', async () => {
    const c = client({
      fetchProductDetail: vi.fn(async () => {
        throw new OffTransientError(429);
      }),
    });
    const r = createDetailResolver({ client: c, storage: createMemoryStorage() });
    expect((await r.resolve('3560070546879')).status).toBe('error');
    await r.resolve('3560070546879');
    expect(c.fetchProductDetail).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent requests for the same EAN', async () => {
    const c = client();
    const r = createDetailResolver({ client: c, storage: createMemoryStorage() });
    await Promise.all([r.resolve('3560070546879'), r.resolve('3560070546879')]);
    expect(c.fetchProductDetail).toHaveBeenCalledTimes(1);
  });
});
