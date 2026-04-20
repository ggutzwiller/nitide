import { describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../src/content/carrefour/throttle.ts';

interface FakeClock {
  now: () => number;
  schedule: (fn: () => void, delay: number) => void;
  advance: (ms: number) => void;
  setNow: (ms: number) => void;
}

function createFakeClock(): FakeClock {
  let current = 0;
  const pending: { fireAt: number; fn: () => void }[] = [];
  return {
    now: () => current,
    schedule: (fn, delay) => {
      pending.push({ fireAt: current + delay, fn });
      pending.sort((a, b) => a.fireAt - b.fireAt);
    },
    advance: (ms) => {
      current += ms;
      while (pending.length > 0 && pending[0]!.fireAt <= current) {
        const next = pending.shift()!;
        next.fn();
      }
    },
    setNow: (ms) => {
      current = ms;
    },
  };
}

describe('RateLimiter', () => {
  it('lets the first `limit` calls start immediately', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      limit: 3,
      intervalMs: 1_000,
      now: clock.now,
      schedule: clock.schedule,
    });

    const order: number[] = [];
    const acquired = [0, 1, 2].map((n) => limiter.acquire().then(() => order.push(n)));
    await Promise.all(acquired);
    expect(order).toEqual([0, 1, 2]);
  });

  it('queues further calls until the oldest slot ages out of the window', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      limit: 2,
      intervalMs: 1_000,
      now: clock.now,
      schedule: clock.schedule,
    });

    const resolved: number[] = [];
    void limiter.acquire().then(() => resolved.push(0));
    void limiter.acquire().then(() => resolved.push(1));
    void limiter.acquire().then(() => resolved.push(2));

    // Give microtasks a chance so the first two can resolve.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toEqual([0, 1]);

    // 999 ms later: third is still queued.
    clock.advance(999);
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toEqual([0, 1]);

    // One more millisecond crosses the interval boundary and the third fires.
    clock.advance(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toEqual([0, 1, 2]);
  });

  it('pause() freezes every acquire until the cool-down expires', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      limit: 10,
      intervalMs: 1_000,
      now: clock.now,
      schedule: clock.schedule,
    });

    const resolved: number[] = [];
    // Consume a slot so the limiter isn't empty.
    await limiter.acquire();

    limiter.pause(500);

    void limiter.acquire().then(() => resolved.push(1));

    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toEqual([]);

    clock.advance(499);
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toEqual([]);

    clock.advance(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toEqual([1]);
  });

  it('pause() takes the max pause when called multiple times', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      limit: 10,
      intervalMs: 1_000,
      now: clock.now,
      schedule: clock.schedule,
    });

    limiter.pause(200);
    limiter.pause(1_000);
    limiter.pause(100); // ignored — shorter than current pause

    const resolved: number[] = [];
    void limiter.acquire().then(() => resolved.push(1));

    clock.advance(999);
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toEqual([]);

    clock.advance(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toEqual([1]);
  });

  it('run() awaits a slot, then executes the task and returns its value', async () => {
    const clock = createFakeClock();
    const limiter = new RateLimiter({
      limit: 1,
      intervalMs: 500,
      now: clock.now,
      schedule: clock.schedule,
    });

    const task = vi.fn(async () => 'done');
    const first = limiter.run(task);
    const second = limiter.run(task);

    await Promise.resolve();
    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);

    clock.advance(500);
    await Promise.resolve();
    await Promise.resolve();
    await first;
    await second;
    expect(task).toHaveBeenCalledTimes(2);
  });
});
