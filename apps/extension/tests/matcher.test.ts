import { describe, expect, it, vi } from 'vitest';
import { OffTransientError, createMemoryStorage, type OffClient, type Product } from '@nitide/core';
import { createMatcher } from '../src/background/matcher.ts';
import { RateLimiter } from '../src/content/carrefour/throttle.ts';

const FULL_PRODUCT: Product = {
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

describe('createMatcher', () => {
  it('resolves by EAN through the injected client', async () => {
    const client = fakeClient({ fetchByBarcode: vi.fn(async () => FULL_PRODUCT) });
    const matcher = createMatcher({ client, storage: createMemoryStorage() });

    const product = await matcher.match({ ean: '3017620422003', name: 'Nutella' });
    expect(product).toEqual(FULL_PRODUCT);
    expect(client.fetchByBarcode).toHaveBeenCalledWith('3017620422003');
    expect(client.searchByText).not.toHaveBeenCalled();
  });

  it('caches successful lookups so a second call bypasses the client', async () => {
    const fetchByBarcode = vi.fn(async () => FULL_PRODUCT);
    const client = fakeClient({ fetchByBarcode });
    const matcher = createMatcher({ client, storage: createMemoryStorage() });

    await matcher.match({ ean: '3017620422003', name: 'Nutella' });
    await matcher.match({ ean: '3017620422003', name: 'Nutella' });
    expect(fetchByBarcode).toHaveBeenCalledTimes(1);
  });

  it('caches a negative result with a shorter TTL', async () => {
    const fetchByBarcode = vi.fn(async () => null);
    const matcher = createMatcher({
      client: fakeClient({ fetchByBarcode }),
      storage: createMemoryStorage(),
    });

    const first = await matcher.match({ ean: '0000000000000', name: 'ghost' });
    const second = await matcher.match({ ean: '0000000000000', name: 'ghost' });
    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(fetchByBarcode).toHaveBeenCalledTimes(1);
  });

  it('swallows unexpected errors and returns null', async () => {
    const matcher = createMatcher({
      client: fakeClient({
        fetchByBarcode: vi.fn(async () => {
          throw new Error('something went wrong');
        }),
      }),
      storage: createMemoryStorage(),
    });

    const product = await matcher.match({ ean: '3017620422003', name: 'Nutella' });
    expect(product).toBeNull();
  });

  it('does not cache when the client throws (transient failures like 429 are retried later)', async () => {
    const storage = createMemoryStorage();
    let attempt = 0;
    const fetchByBarcode = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error('rate-limited');
      return FULL_PRODUCT;
    });
    const matcher = createMatcher({
      client: fakeClient({ fetchByBarcode }),
      storage,
      maxRetries: 0,
    });

    const first = await matcher.match({ ean: '3017620422003', name: 'Nutella' });
    expect(first).toBeNull();

    // A retry on the next tick should now hit the client again — the previous
    // transient error must not have been cached.
    const second = await matcher.match({ ean: '3017620422003', name: 'Nutella' });
    expect(second).toEqual(FULL_PRODUCT);
    expect(fetchByBarcode).toHaveBeenCalledTimes(2);
  });

  it('retries once on OffTransientError and pauses the limiter', async () => {
    let attempt = 0;
    const fetchByBarcode = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new OffTransientError(429, 500);
      return FULL_PRODUCT;
    });
    const limiter = new RateLimiter();
    const pauseSpy = vi.spyOn(limiter, 'pause');
    const matcher = createMatcher({
      client: fakeClient({ fetchByBarcode }),
      storage: createMemoryStorage(),
      limiter,
    });

    const product = await matcher.match({ ean: '3017620422003', name: 'Nutella' });
    expect(product).toEqual(FULL_PRODUCT);
    expect(fetchByBarcode).toHaveBeenCalledTimes(2);
    expect(pauseSpy).toHaveBeenCalledWith(500);
  });

  it('gives up after the configured number of retries and returns null without caching', async () => {
    const storage = createMemoryStorage();
    const fetchByBarcode = vi.fn(async () => {
      throw new OffTransientError(429, 10);
    });
    const matcher = createMatcher({
      client: fakeClient({ fetchByBarcode }),
      storage,
      maxRetries: 2,
    });

    const first = await matcher.match({ ean: '3017620422003', name: 'Nutella' });
    expect(first).toBeNull();
    expect(fetchByBarcode).toHaveBeenCalledTimes(3); // initial + 2 retries

    // Not cached → next call retries again.
    fetchByBarcode.mockClear();
    await matcher.match({ ean: '3017620422003', name: 'Nutella' });
    expect(fetchByBarcode).toHaveBeenCalledTimes(3);
  });

  it('falls back to defaultBackoffMs when Retry-After is absent', async () => {
    const fetchByBarcode = vi.fn(async () => {
      throw new OffTransientError(503);
    });
    const limiter = new RateLimiter();
    const pauseSpy = vi.spyOn(limiter, 'pause');
    const matcher = createMatcher({
      client: fakeClient({ fetchByBarcode }),
      storage: createMemoryStorage(),
      limiter,
      defaultBackoffMs: 2_500,
      maxRetries: 0,
    });

    await matcher.match({ ean: '3017620422003', name: 'Nutella' });
    expect(pauseSpy).toHaveBeenCalledWith(2_500);
  });
});
