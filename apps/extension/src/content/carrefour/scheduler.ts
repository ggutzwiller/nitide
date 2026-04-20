// Orchestrates DOM scans on Carrefour:
// - Debounces rescans so bursty mutations (pagination, filter changes,
//   hydration) collapse into one pass.
// - Dedupes by EAN so already-processed tiles never trigger a second lookup.
// - Dispatches `resolve` in parallel and hands the result to `render`.
//
// Rate limiting used to live here but now belongs to the service worker
// (see `src/background/matcher.ts`) — it's the single source of truth and
// shared across tabs.
//
// The scheduler is framework-agnostic: `resolve` and `render` are injected so
// we can test the orchestration logic without a real OFF client.

import type { Product } from '@nitide/core';
import { extractProductsFromPage, type ProductDomNode } from './parser.ts';

export interface SchedulerDeps {
  /** Resolve a DOM-extracted product to an OFF product (or null). */
  resolve: (node: ProductDomNode) => Promise<Product | null>;
  /** Render (or clear) the badge for a tile. */
  render: (node: ProductDomNode, product: Product | null) => void;
  /** Scan root; defaults to `document`. */
  root?: ParentNode;
  /** Debounce window in milliseconds. */
  debounceMs?: number;
  /** Swapped out in tests to drive timers deterministically. */
  setTimer?: (fn: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

export class CarrefourScheduler {
  private readonly seen = new Set<string>();
  private readonly pending: ProductDomNode[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly resolve: SchedulerDeps['resolve'];
  private readonly render: SchedulerDeps['render'];
  private readonly root: ParentNode;
  private readonly debounceMs: number;
  private readonly setTimer: NonNullable<SchedulerDeps['setTimer']>;
  private readonly clearTimer: NonNullable<SchedulerDeps['clearTimer']>;

  constructor(deps: SchedulerDeps) {
    this.resolve = deps.resolve;
    this.render = deps.render;
    this.root = deps.root ?? document;
    this.debounceMs = deps.debounceMs ?? 300;
    this.setTimer = deps.setTimer ?? ((fn, d) => setTimeout(fn, d));
    this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
  }

  /** Register a mutation signal — coalesces into one debounced scan. */
  bump(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  /** Force an immediate scan. Useful on startup and in tests. */
  async flush(): Promise<void> {
    const tiles = extractProductsFromPage(this.root);
    let newCount = 0;
    for (const tile of tiles) {
      if (this.seen.has(tile.ean)) continue;
      this.seen.add(tile.ean);
      this.pending.push(tile);
      newCount++;
    }
    console.info(
      `[Nitide] scan: ${tiles.length} tile(s) found, ${newCount} new (${this.seen.size} total seen)`,
    );
    await this.drain();
  }

  /** Test hook: how many tiles have been observed so far. */
  seenCount(): number {
    return this.seen.size;
  }

  private async drain(): Promise<void> {
    const batch = this.pending.splice(0, this.pending.length);
    await Promise.all(
      batch.map(async (tile) => {
        try {
          const product = await this.resolve(tile);
          this.render(tile, product);
        } catch {
          // Belt-and-braces: `resolve` already swallows network errors in
          // practice, but one bad tile should never take the batch down.
          this.render(tile, null);
        }
      }),
    );
  }
}
