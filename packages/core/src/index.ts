export * from './types.ts';

export {
  DEFAULT_TIMEOUT_MS,
  OFF_BASE_URL,
  USER_AGENT,
  createOffClient,
  parseProduct,
} from './off-client.ts';
export type { OffClient, OffClientDeps } from './off-client.ts';

export {
  DEFAULT_NULL_TTL_MS,
  DEFAULT_POSITIVE_TTL_MS,
  TtlCache,
  createChromeLocalStorage,
  createMemoryStorage,
} from './cache.ts';
export type { AsyncKeyValueStorage, TtlEntry } from './cache.ts';

export { buildCacheKey, matchProduct, normalizeTextKey } from './matching.ts';
export type { MatchDeps } from './matching.ts';
