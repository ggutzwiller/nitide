// Stub — M3 will resolve a DOM-extracted product to an OFF product.
// Priority: barcode, then fallback to text search on name + brand.
import type { DomProduct, Product } from './types.ts';

export async function matchProduct(_dom: DomProduct): Promise<Product | null> {
  throw new Error('matchProduct: not implemented (M3)');
}
