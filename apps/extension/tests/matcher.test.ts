import { describe, expect, it } from 'vitest';
import { parseScoresDataset, serializeScoresDataset } from '@nitide/core';
import { createMatcher } from '../src/background/matcher.ts';

const dataset = parseScoresDataset(
  serializeScoresDataset([{ ean: '3560070546879', nutriScore: 'a', greenScore: 'b', nova: 1 }]),
);

describe('createMatcher', () => {
  it('builds a Product from a dataset hit', () => {
    const matcher = createMatcher(dataset);
    const product = matcher.match({ ean: '3560070546879', name: 'Pâtes', brand: 'Carrefour' });
    expect(product).toEqual({
      ean: '3560070546879',
      name: 'Pâtes',
      brand: 'Carrefour',
      nutriScore: 'a',
      greenScore: 'b',
      nova: 1,
      offUrl: 'https://world.openfoodfacts.org/product/3560070546879',
    });
  });

  it('returns null when the EAN is not in the dataset', () => {
    const matcher = createMatcher(dataset);
    expect(matcher.match({ ean: '0000000000000', name: 'ghost' })).toBeNull();
  });

  it('returns null when the input has no EAN', () => {
    const matcher = createMatcher(dataset);
    expect(matcher.match({ name: 'no barcode' })).toBeNull();
  });

  it('returns null (without throwing) when the dataset failed to load', () => {
    const matcher = createMatcher(null);
    expect(matcher.match({ ean: '3560070546879', name: 'Pâtes' })).toBeNull();
  });

  it('defaults brand to null when the tile has none', () => {
    const matcher = createMatcher(dataset);
    const product = matcher.match({ ean: '3560070546879', name: 'Pâtes' });
    expect(product?.brand).toBeNull();
  });
});
