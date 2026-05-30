// Content script entry point for carrefour.fr.
//
// The content script lives in the page world: it sees the Carrefour DOM but not
// the bundled scores dataset, which the service worker holds. So every lookup is
// proxied to the worker via `chrome.runtime.sendMessage`. See src/background for
// the handler.

import type { Product } from '@nitide/core';
import { renderBadge } from './badge.ts';
import { CarrefourScheduler } from './scheduler.ts';
import type { ProductDomNode } from './parser.ts';
import { MATCH_CHANNEL, type MatchRequest, type MatchResponse } from '../../shared/messages.ts';
import { syncPdpPanel } from './pdp.ts';

async function resolve(node: ProductDomNode): Promise<Product | null> {
  const message: MatchRequest = {
    type: MATCH_CHANNEL,
    input: { ean: node.ean, name: node.name, brand: node.brand },
  };
  try {
    const response = (await chrome.runtime.sendMessage(message)) as MatchResponse | undefined;
    const product = response?.product ?? null;
    console.info(`[Nitide] resolve ${node.ean}: ${product ? 'hit' : 'miss'} (${node.name})`);
    return product;
  } catch (err) {
    // Worker asleep, extension disabled mid-flight, etc. — degrade gracefully.
    console.warn(`[Nitide] resolve ${node.ean}: rpc failed`, err);
    return null;
  }
}

function render(node: ProductDomNode, product: Product | null): void {
  // Carrefour's framework can replace an <article> after our initial scan,
  // leaving `node.element` detached. Re-query by the stable data-testid so we
  // always inject into the live tree.
  const live = document.querySelector<HTMLElement>(
    `article[data-testid="${CSS.escape(node.ean)}"]`,
  );
  const target = live ?? node.element;
  if (!target.isConnected) {
    console.info(`[Nitide] render ${node.ean}: element not in DOM, skipping`);
    return;
  }
  renderBadge(target, product);
}

function boot(): void {
  console.info('[Nitide] active on Carrefour', location.href);

  const scheduler = new CarrefourScheduler({
    resolve,
    render,
  });

  void scheduler.flush();
  syncPdpPanel();

  let mutationTicks = 0;
  const observer = new MutationObserver(() => {
    mutationTicks++;
    if (mutationTicks === 1 || mutationTicks % 50 === 0) {
      console.info(`[Nitide] mutation #${mutationTicks} — scheduling scan`);
    }
    scheduler.bump();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Carrefour's SPA uses history.pushState without reloading. Content scripts
  // live in an isolated world so we can't monkey-patch history, but we can
  // detect navigations by polling location.href — the MutationObserver already
  // covers the DOM changes; this poll simply logs a clear "navigation" marker.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      console.info(`[Nitide] navigation ${lastHref} → ${location.href}`);
      lastHref = location.href;
      scheduler.bump();
      syncPdpPanel();
    }
  }, 500);

  window.addEventListener('popstate', () => {
    console.info('[Nitide] popstate →', location.href);
    scheduler.bump();
    syncPdpPanel();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
