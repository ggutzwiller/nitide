// Courses U adapter: all the coursesu.com DOM specifics in one place.
//
// Courses U (Salesforce Commerce Cloud + Vue 3) exposes the EAN directly on
// each listing tile: `div.product-tile[data-itemid]` carries `data-item-ean`,
// so we never need a text search or a network call. Product pages use
// `/p/<slug>/<internal-id>.html` URLs that do NOT contain the EAN, so the PDP
// hooks read the EAN from the DOM (see Task 2). Navigation is a full page
// reload, which the shared engine handles via its MutationObserver + location
// poll. See `apps/extension/docs/coursesu-dom.md`.

import type { ProductDomNode, Retailer } from '../engine/types.ts';

const EAN_PATTERN = /^\d{8,14}$/;
const TILE_SELECTOR = 'div.product-tile[data-itemid]';

// Where we try to inject the badge (first match wins, falls back to the tile).
// `.product-image-content` is present on every tile and holds the existing
// Nutri-Score icon area, so the badge sits consistently next to it. Kept as an
// array so more candidates can be added if Courses U reworks the tile.
const BADGE_SLOTS = ['.product-image-content'];

export function extractProductsFromPage(root: ParentNode = document): ProductDomNode[] {
  const tiles = root.querySelectorAll<HTMLElement>(TILE_SELECTOR);
  const nodes: ProductDomNode[] = [];
  for (const element of tiles) {
    const product = extractTile(element);
    if (product) nodes.push(product);
  }
  return nodes;
}

export function extractTile(element: HTMLElement): ProductDomNode | null {
  const ean = element.getAttribute('data-item-ean');
  if (!ean || !EAN_PATTERN.test(ean)) return null;

  const name = readName(element);
  if (!name) return null;

  const href = readHref(element);

  const node: ProductDomNode = { element, ean, name };
  if (href) node.href = href;
  return node;
}

function readName(element: HTMLElement): string {
  const nameLink = element.querySelector<HTMLElement>('h2.product-name .name-link');
  const text = nameLink?.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

function readHref(element: HTMLElement): string | undefined {
  const link = element.querySelector<HTMLAnchorElement>('a[href^="/p/"]');
  return link?.getAttribute('href') ?? undefined;
}

// PDP URLs are `/p/<slug>/<internal-id>.html`. The internal id is NOT the EAN,
// so this only gates "are we on a product page" and yields the internal id.
const PDP_URL = /\/p\/[^?#]*\/(\d+)\.html(?:[?#]|$)/;

/**
 * Returns the main product's EAN on a Courses U PDP, or null. The EAN is not in
 * the URL: we read the main product's internal id from `#pdpMain[data-itemid]`,
 * then find the `data-tc-product-tile` JSON blob whose `id` matches and return
 * its `EAN`. The browser already HTML-decodes the attribute, so it is valid JSON.
 */
export function extractPdpEan(url: string): string | null {
  if (!PDP_URL.test(url)) return null;

  const mainId = document.querySelector('#pdpMain')?.getAttribute('data-itemid');
  if (!mainId) return null;

  for (const el of document.querySelectorAll('[data-tc-product-tile]')) {
    const raw = el.getAttribute('data-tc-product-tile');
    if (!raw) continue;
    let blob: { id?: unknown; EAN?: unknown };
    try {
      blob = JSON.parse(raw) as typeof blob;
    } catch {
      continue;
    }
    if (String(blob.id) !== mainId) continue;
    const ean = typeof blob.EAN === 'string' ? blob.EAN : null;
    return ean && EAN_PATTERN.test(ean) ? ean : null;
  }
  return null;
}

function findPanelSlot(): HTMLElement | null {
  const h1 = document.querySelector<HTMLElement>('h1.pdp-product-name');
  return h1?.closest('div') ?? h1?.parentElement ?? null;
}

export const coursesuRetailer: Retailer = {
  id: 'coursesu',
  extractProducts: extractProductsFromPage,
  // EAN is purely numeric (validated /^\d{8,14}$/), so it needs no escaping
  // inside a double-quoted CSS attribute value. Do NOT wrap it in CSS.escape:
  // CSS.escape hex-escapes a leading digit (e.g. "3256…" -> "\\33 256…"), which
  // then fails to match the literal attribute value.
  findLiveTile: (node) =>
    document.querySelector<HTMLElement>(`div.product-tile[data-item-ean="${node.ean}"]`),
  findBadgeSlot: (tile) => {
    for (const selector of BADGE_SLOTS) {
      const slot = tile.querySelector<HTMLElement>(selector);
      if (slot) return slot;
    }
    return tile;
  },
  pdp: {
    extractEan: extractPdpEan,
    findPanelSlot,
  },
};
