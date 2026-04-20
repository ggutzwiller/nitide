// Stub — M2 will wrap chrome.storage.local with a TTL cache keyed on EAN or hash(name+brand).
import type { Product } from './types.ts';

export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export async function get(_key: string): Promise<Product | null> {
  throw new Error('cache.get: not implemented (M2)');
}

export async function set(_key: string, _value: Product): Promise<void> {
  throw new Error('cache.set: not implemented (M2)');
}
