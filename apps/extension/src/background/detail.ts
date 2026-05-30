// Worker-side resolver for product-detail requests: cache-first, then one live
// OFF lookup. Found is cached 30 days, not-found 24 hours, errors never. In-flight
// requests for the same EAN are coalesced.
import {
  TtlCache,
  createDetailClient,
  type AsyncKeyValueStorage,
  type DetailClient,
} from '@nitide/core';
import type { DetailResponse } from '../shared/messages.ts';

// Found products are stable, so cache them long (30 days) to spare OFF.
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
// "Not found" is cached briefly (24 hours): it avoids re-hammering OFF for a
// missing product, while letting it reappear soon once OFF's data grows.
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1_000;

export interface DetailResolverDeps {
  client?: DetailClient;
  storage?: AsyncKeyValueStorage;
}

export interface DetailResolver {
  resolve(ean: string): Promise<DetailResponse>;
}

export function createDetailResolver(deps: DetailResolverDeps = {}): DetailResolver {
  const client = deps.client ?? createDetailClient();
  const cache = deps.storage ? new TtlCache(deps.storage) : undefined;
  const inFlight = new Map<string, Promise<DetailResponse>>();

  async function load(ean: string): Promise<DetailResponse> {
    const key = `detail:${ean}`;

    // Cache-first: a stored found/not-found short-circuits the network.
    if (cache) {
      const cached = await cache.get<DetailResponse>(key);
      if (cached) return cached;
    }

    try {
      const detail = await client.fetchProductDetail(ean);
      const response: DetailResponse = detail
        ? { status: 'found', detail }
        : { status: 'not-found', detail: null };
      if (cache) await cache.set(key, response, detail ? FOUND_TTL_MS : NOT_FOUND_TTL_MS);
      return response;
    } catch {
      // Transient OFF failure, surface as 'error' and don't cache it.
      return { status: 'error', detail: null };
    }
  }

  return {
    resolve(ean) {
      // Coalesce concurrent lookups for the same product into a single request.
      const existing = inFlight.get(ean);
      if (existing) return existing;

      const promise = load(ean).finally(() => inFlight.delete(ean));
      inFlight.set(ean, promise);
      return promise;
    },
  };
}
