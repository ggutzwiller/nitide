// Orchestrates DOM scans on a listing page:
// - Debounces rescans so bursty mutations (pagination, filter changes,
//   hydration) collapse into one pass.
// - Dedupes by EAN so already-processed tiles never trigger a second lookup.
// - Dispatches `resolve` in parallel and hands the result to `render`.
//
// Rate limiting lives in the service worker (see `src/background/matcher.ts`),
// it's the single source of truth and shared across tabs.
//
// The scheduler is retailer-agnostic: `extract`, `resolve` and `render` are all
// injected, so it works for any site and is testable without a real DOM source.

import type { Product } from '@nitide/core';
import type { ProductDomNode } from './types.ts';

export interface SchedulerDeps {
  /** Extract product tiles from the scan root. */
  extract: (root: ParentNode) => ProductDomNode[];
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

export class Scheduler {
  private readonly seen = new Set<string>();
  private readonly pending: ProductDomNode[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly extract: SchedulerDeps['extract'];
  private readonly resolve: SchedulerDeps['resolve'];
  private readonly render: SchedulerDeps['render'];
  private readonly root: ParentNode;
  private readonly debounceMs: number;
  private readonly setTimer: NonNullable<SchedulerDeps['setTimer']>;
  private readonly clearTimer: NonNullable<SchedulerDeps['clearTimer']>;

  constructor(deps: SchedulerDeps) {
    this.extract = deps.extract;
    this.resolve = deps.resolve;
    this.render = deps.render;
    this.root = deps.root ?? document;
    this.debounceMs = deps.debounceMs ?? 300;
    this.setTimer = deps.setTimer ?? ((fn, d) => setTimeout(fn, d));
    this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle));
  }

  /** Register a mutation signal, coalesces into one debounced scan. */
  bump(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  /** Force an immediate scan. Useful on startup and in tests. */
  async flush(): Promise<void> {
    const tiles = this.extract(this.root);
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
