// Stub — M2 will implement fetchByBarcode and searchByText against world.openfoodfacts.org.
import type { Product } from './types.ts';

export async function fetchByBarcode(_ean: string): Promise<Product | null> {
  throw new Error('fetchByBarcode: not implemented (M2)');
}

export async function searchByText(_name: string, _brand?: string): Promise<Product | null> {
  throw new Error('searchByText: not implemented (M2)');
}
