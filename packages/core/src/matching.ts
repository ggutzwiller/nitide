// Resolves a DOM-extracted product to an OFF product, with caching.
//
// Strategy:
// 1. Build a deterministic cache key (`ean:<code>` or `text:<normalized>`).
// 2. Check the cache — a hit short-circuits the API, including a cached `null`
//    (product previously looked up and not found).
// 3. On miss, call the OFF client (barcode first if we have one, otherwise
//    text search) and cache the result: 30 days for hits, 24h for misses.
import type { MatchInput, Product } from './types.ts';
import {
  DEFAULT_NULL_TTL_MS,
  DEFAULT_POSITIVE_TTL_MS,
  TtlCache,
  createChromeLocalStorage,
} from './cache.ts';
import { createOffClient, type OffClient } from './off-client.ts';

export interface MatchDeps {
  client?: OffClient;
  cache?: TtlCache;
  positiveTtlMs?: number;
  nullTtlMs?: number;
}

export function normalizeTextKey(name: string, brand?: string): string {
  return [name, brand ?? '']
    .map((s) =>
      s
        .normalize('NFKD')
        // Strip combining marks (accents) left by NFKD so "Nestlé" and "Nestle"
        // collapse to the same key.
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('|');
}

export function buildCacheKey(input: MatchInput): string {
  if (input.ean) return `ean:${input.ean}`;
  return `text:${normalizeTextKey(input.name, input.brand)}`;
}

export async function matchProduct(
  input: MatchInput,
  deps: MatchDeps = {},
): Promise<Product | null> {
  const client = deps.client ?? createOffClient();
  const cache = deps.cache ?? new TtlCache(createChromeLocalStorage());
  const positiveTtl = deps.positiveTtlMs ?? DEFAULT_POSITIVE_TTL_MS;
  const nullTtl = deps.nullTtlMs ?? DEFAULT_NULL_TTL_MS;

  const key = buildCacheKey(input);
  const cached = await cache.get<Product | null>(key);
  if (cached !== null) return cached.value;

  const result = input.ean
    ? await client.fetchByBarcode(input.ean)
    : await client.searchByText(input.name, input.brand);

  await cache.set(key, result, result ? positiveTtl : nullTtl);
  return result;
}
