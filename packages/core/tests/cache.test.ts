import { describe, expect, it } from 'vitest';
import { TtlCache, createMemoryStorage } from '../src/cache.ts';

describe('TtlCache', () => {
  it('returns a stored value before expiry', async () => {
    let now = 1_000;
    const cache = new TtlCache(createMemoryStorage(), () => now);
    await cache.set('k', { v: 1 }, 5_000);
    expect(await cache.get('k')).toEqual({ v: 1 });
    now = 5_999;
    expect(await cache.get('k')).toEqual({ v: 1 });
  });

  it('returns undefined after expiry and for a miss', async () => {
    let now = 1_000;
    const cache = new TtlCache(createMemoryStorage(), () => now);
    await cache.set('k', 'x', 1_000);
    now = 2_001;
    expect(await cache.get('k')).toBeUndefined();
    expect(await cache.get('absent')).toBeUndefined();
  });
});
