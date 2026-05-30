import { describe, expect, it } from 'vitest';
import { extractPdpEan } from '../src/content/carrefour/pdp.ts';

describe('extractPdpEan', () => {
  it('extracts the EAN from a product URL', () => {
    expect(
      extractPdpEan('https://www.carrefour.fr/p/pates-pipe-rigate-carrefour-3560070546879'),
    ).toBe('3560070546879');
  });
  it('handles query/hash suffixes', () => {
    expect(extractPdpEan('https://www.carrefour.fr/p/x-3560070546879?foo=1#bar')).toBe(
      '3560070546879',
    );
  });
  it('returns null on non-product pages', () => {
    expect(extractPdpEan('https://www.carrefour.fr/s?q=pates')).toBeNull();
    expect(extractPdpEan('https://www.carrefour.fr/p/no-barcode-here')).toBeNull();
  });
});
