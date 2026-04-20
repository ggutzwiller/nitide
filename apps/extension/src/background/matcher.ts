// The OFF lookup + cache logic that runs inside the service worker.
// Keeping it in its own module makes it trivially testable — no chrome API,
// no live network.

import {
  OffTransientError,
  TtlCache,
  createOffClient,
  matchProduct,
  type AsyncKeyValueStorage,
  type MatchInput,
  type OffClient,
  type Product,
} from '@nitide/core';
import { RateLimiter, type RateLimiterOptions } from '../content/carrefour/throttle.ts';

export interface MatcherDeps {
  client?: OffClient;
  storage?: AsyncKeyValueStorage;
  limiter?: RateLimiter;
  rateLimit?: RateLimiterOptions;
  /**
   * How many times a transient failure (429, 5xx, network) is retried before
   * giving up and returning `null`. Defaults to 1 — one retry plus the initial
   * attempt.
   */
  maxRetries?: number;
  /**
   * Fallback pause in milliseconds when OFF does not advertise a `Retry-After`.
   * Defaults to 10 s.
   */
  defaultBackoffMs?: number;
}

export interface Matcher {
  match(input: MatchInput): Promise<Product | null>;
}

export function createMatcher(deps: MatcherDeps = {}): Matcher {
  const limiter = deps.limiter ?? new RateLimiter(deps.rateLimit);
  // Every outbound HTTP request is funneled through the limiter so bursty
  // tabs never exceed OFF's limits. Cache hits bypass it entirely.
  const client =
    deps.client ??
    createOffClient({
      fetch: (input, init) => limiter.run(() => globalThis.fetch(input, init)),
    });

  const cache = deps.storage ? new TtlCache(deps.storage) : undefined;
  const matchDeps = cache ? { client, cache } : { client };
  const maxRetries = deps.maxRetries ?? 1;
  const defaultBackoffMs = deps.defaultBackoffMs ?? 10_000;

  return {
    async match(input) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await matchProduct(input, matchDeps);
        } catch (err) {
          if (err instanceof OffTransientError) {
            // Freeze the whole limiter — sibling in-flight calls will honour
            // the cool-down too, and the retry below waits it out naturally
            // via the next `acquire()`.
            limiter.pause(err.retryAfterMs ?? defaultBackoffMs);
            if (attempt < maxRetries) continue;
          }
          // Either the final retry failed, or an unexpected non-transient
          // error bubbled up. Degrade gracefully without caching the miss.
          return null;
        }
      }
      return null;
    },
  };
}
