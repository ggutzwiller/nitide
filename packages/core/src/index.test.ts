import { describe, expect, it } from 'vitest';
import { CACHE_TTL_MS } from './cache.ts';
import type { NutriScore } from './types.ts';

describe('@nitide/core', () => {
  it('exposes a 30-day cache TTL in milliseconds', () => {
    expect(CACHE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('accepts the five Nutri-Score grades', () => {
    const grades: NutriScore[] = ['A', 'B', 'C', 'D', 'E'];
    expect(grades).toHaveLength(5);
  });
});
