// Loads the FR scores dataset bundled with the extension and parses it into a
// queryable `ScoresDataset`. The file lives at `public/data/scores-fr.bin.gz`
// (Vite copies `public/` to the dist root), so the service worker can fetch it
// from its own origin without `web_accessible_resources`.
//
// Everything degrades gracefully: any failure (missing asset, corrupt gzip,
// bad format) resolves to `null`. Callers treat `null` as "every lookup misses"
// rather than crashing, see src/background/matcher.ts.
import { parseScoresDataset, type ScoresDataset } from '@nitide/core';

const ASSET_PATH = 'data/scores-fr.bin.gz';

let cached: Promise<ScoresDataset | null> | undefined;

/** Lazy + memoized: the asset is fetched and parsed at most once per worker. */
export function loadBundledDataset(): Promise<ScoresDataset | null> {
  if (!cached) cached = load();
  return cached;
}

async function load(): Promise<ScoresDataset | null> {
  try {
    const res = await fetch(chrome.runtime.getURL(ASSET_PATH));
    if (!res.ok || !res.body) {
      console.warn(`[Nitide] dataset asset unavailable (HTTP ${res.status})`);
      return null;
    }
    const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
    const buffer = await new Response(stream).arrayBuffer();
    const dataset = parseScoresDataset(buffer);
    console.info(`[Nitide] dataset loaded: ${dataset.count} products`);
    return dataset;
  } catch (err) {
    console.warn('[Nitide] failed to load dataset', err);
    return null;
  }
}
