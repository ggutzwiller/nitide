// Minimal promise-based rate limiter.
//
// Semantics: at most `limit` calls start within any rolling `intervalMs`
// window. Extra calls wait in FIFO order. A single-slot bucket gives the
// classic "1 request every X ms" behaviour; raising `limit` lets short bursts
// pass through while still capping sustained throughput.
//
// Defaults stay comfortably under OFF's published budget for
// `/api/v2/product/{ean}` (100 req/min). Bursts of 5 requests per rolling
// 4-second window ≈ 75 req/min — ~25 % headroom before the server throttles.
// The PROJECT.md-era "10 req/sec" ceiling was too optimistic; Carrefour pages
// bursting at that rate trip the server's limiter immediately.

export interface RateLimiterOptions {
  /** Maximum calls that can start in any rolling interval window. */
  limit: number;
  /** Size of the rolling window in milliseconds. */
  intervalMs: number;
  /** Clock source — overridden in tests. */
  now?: () => number;
  /** Timer scheduler — overridden in tests so fake timers take over. */
  schedule?: (fn: () => void, delayMs: number) => void;
}

export const DEFAULT_RATE_LIMIT: RateLimiterOptions = {
  limit: 5,
  intervalMs: 4_000,
};

export class RateLimiter {
  private readonly limit: number;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, delayMs: number) => void;
  private readonly starts: number[] = [];
  private readonly queue: Array<() => void> = [];
  private draining = false;
  private pausedUntil = 0;

  constructor(options: RateLimiterOptions = DEFAULT_RATE_LIMIT) {
    this.limit = options.limit;
    this.intervalMs = options.intervalMs;
    this.now = options.now ?? (() => Date.now());
    this.schedule = options.schedule ?? ((fn, delay) => void setTimeout(fn, delay));
  }

  /**
   * Freeze the limiter for at least `durationMs`. All pending and future
   * `acquire()` calls wait until the pause expires. Used by the matcher on
   * HTTP 429 so every concurrent request in flight — not just the unlucky
   * one — honours OFF's cool-down.
   */
  pause(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    const until = this.now() + durationMs;
    if (until > this.pausedUntil) this.pausedUntil = until;
  }

  /**
   * Wait for a slot, then resolve. Caller performs the actual work right after.
   * Intentionally not marked `async` so the inner Promise resolves in one
   * microtask hop instead of two — keeps tests predictable.
   */
  acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  /**
   * Convenience wrapper: schedule `task` when a slot is available.
   * Rejects if `task` rejects; does not consume the slot twice.
   */
  run<T>(task: () => Promise<T>): Promise<T> {
    return this.acquire().then(task);
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const wait = this.nextSlotDelay();
        if (wait > 0) {
          this.schedule(() => {
            this.draining = false;
            this.drain();
          }, wait);
          return;
        }
        const resolve = this.queue.shift();
        if (!resolve) break;
        this.starts.push(this.now());
        resolve();
      }
    } finally {
      this.draining = false;
    }
  }

  private nextSlotDelay(): number {
    const now = this.now();
    const pauseDelay = Math.max(0, this.pausedUntil - now);
    const cutoff = now - this.intervalMs;
    while (this.starts.length > 0 && this.starts[0]! <= cutoff) {
      this.starts.shift();
    }
    const budgetDelay =
      this.starts.length < this.limit ? 0 : Math.max(0, this.starts[0]! + this.intervalMs - now);
    return Math.max(pauseDelay, budgetDelay);
  }
}
