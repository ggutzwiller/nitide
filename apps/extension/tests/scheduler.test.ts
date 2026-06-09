import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@nitide/core';
import { Scheduler } from '../src/content/engine/scheduler.ts';
import { extractProductsFromPage } from '../src/content/carrefour/retailer.ts';

function buildTile(ean: string, name = 'Something'): HTMLElement {
  const article = document.createElement('article');
  article.setAttribute('data-testid', ean);
  const h3 = document.createElement('h3');
  h3.className = 'product-card-title__text';
  h3.textContent = name;
  article.appendChild(h3);
  return article;
}

const FAKE_PRODUCT: Product = {
  ean: 'x',
  name: 'X',
  brand: null,
  nutriScore: 'a',
  greenScore: 'a',
  nova: 1,
  offUrl: '',
};

describe('Scheduler', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('scans, resolves and renders every tile on flush()', async () => {
    document.body.appendChild(buildTile('3017620422003'));
    document.body.appendChild(buildTile('3560070546879'));

    const resolved: string[] = [];
    const rendered: string[] = [];

    const scheduler = new Scheduler({ extract: extractProductsFromPage,
      resolve: async (node) => {
        resolved.push(node.ean);
        return FAKE_PRODUCT;
      },
      render: (node) => {
        rendered.push(node.ean);
      },
    });

    await scheduler.flush();
    expect(resolved.sort()).toEqual(['3017620422003', '3560070546879']);
    expect(rendered.sort()).toEqual(['3017620422003', '3560070546879']);
  });

  it('never processes the same tile twice, even across flushes', async () => {
    document.body.appendChild(buildTile('3017620422003'));

    const resolve = vi.fn(async () => FAKE_PRODUCT);
    const scheduler = new Scheduler({ extract: extractProductsFromPage, resolve, render: () => {} });

    await scheduler.flush();
    await scheduler.flush();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('debounces bursty bump() calls into one flush', async () => {
    document.body.appendChild(buildTile('3017620422003'));

    const resolve = vi.fn(async () => FAKE_PRODUCT);
    let pendingFn: (() => void) | null = null;
    const scheduler = new Scheduler({ extract: extractProductsFromPage,
      resolve,
      render: () => {},
      debounceMs: 300,
      setTimer: (fn) => {
        pendingFn = fn;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => {
        pendingFn = null;
      },
    });

    scheduler.bump();
    scheduler.bump();
    scheduler.bump();
    // Only the last timer callback remains — fire it.
    pendingFn?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('still renders (with null) when resolve throws', async () => {
    document.body.appendChild(buildTile('3017620422003'));

    const rendered: Array<Product | null> = [];
    const scheduler = new Scheduler({ extract: extractProductsFromPage,
      resolve: async () => {
        throw new Error('boom');
      },
      render: (_tile, product) => {
        rendered.push(product);
      },
    });

    await scheduler.flush();
    expect(rendered).toEqual([null]);
  });
});
