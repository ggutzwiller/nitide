// Retailer-agnostic content-script runtime.
//
// Two isolated worlds: the content script lives in the page (sees the DOM), the
// service worker holds the bundled scores dataset. They share no memory, so
// every lookup is proxied to the worker via `chrome.runtime.sendMessage`
// (MATCH_CHANNEL). `start(retailer)` wires a site's DOM specifics (the
// `Retailer` adapter) into the shared scan/render/observe loop.

import type { Product } from '@nitide/core';
import { Scheduler } from './scheduler.ts';
import { renderBadge } from './badge.ts';
import { syncPanel } from './pdp.ts';
import type { ProductDomNode, Retailer } from './types.ts';
import { MATCH_CHANNEL, type MatchRequest, type MatchResponse } from '../../shared/messages.ts';

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
    // Worker asleep, extension disabled mid-flight, etc., degrade gracefully.
    console.warn(`[Nitide] resolve ${node.ean}: rpc failed`, err);
    return null;
  }
}

export function start(retailer: Retailer): void {
  console.info(`[Nitide] active on ${retailer.id}`, location.href);

  const scheduler = new Scheduler({
    extract: (root) => retailer.extractProducts(root),
    resolve,
    render: (node, product) => {
      // The framework can replace a tile after our initial scan, leaving
      // `node.element` detached. Re-query the live node so we always inject into
      // the live tree.
      const live = retailer.findLiveTile(node) ?? node.element;
      if (!live.isConnected) {
        console.info(`[Nitide] render ${node.ean}: element not in DOM, skipping`);
        return;
      }
      renderBadge(live, product, retailer.findBadgeSlot);
    },
  });

  const syncPdp = () => {
    if (retailer.pdp) syncPanel(retailer.pdp);
  };

  void scheduler.flush();
  syncPdp();

  let mutationTicks = 0;
  const observer = new MutationObserver(() => {
    mutationTicks++;
    if (mutationTicks === 1 || mutationTicks % 50 === 0) {
      console.info(`[Nitide] mutation #${mutationTicks}, scheduling scan`);
    }
    scheduler.bump();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // These sites are SPAs: they navigate via history.pushState without reloading.
  // Content scripts live in an isolated world so we can't monkey-patch history,
  // but we can detect navigations by polling location.href. The MutationObserver
  // already covers DOM changes; this poll re-syncs the PDP panel and logs a clear
  // navigation marker.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      console.info(`[Nitide] navigation ${lastHref} → ${location.href}`);
      lastHref = location.href;
      scheduler.bump();
      syncPdp();
    }
  }, 500);

  window.addEventListener('popstate', () => {
    console.info('[Nitide] popstate →', location.href);
    scheduler.bump();
    syncPdp();
  });
}

export function bootWhenReady(retailer: Retailer): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => start(retailer), { once: true });
  } else {
    start(retailer);
  }
}
