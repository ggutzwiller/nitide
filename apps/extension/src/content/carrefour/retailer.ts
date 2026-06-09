// Carrefour adapter: all the carrefour.fr DOM specifics in one place.
//
// On Carrefour every product tile in a PLP is an `<article>` whose `data-testid`
// *is* the EAN, so we never need a text search. PDP URLs are `/p/<slug>-<ean>`.
// See `apps/extension/docs/carrefour-dom.md` for the full DOM analysis.

import type { ProductDomNode, Retailer } from '../engine/types.ts';

const EAN_PATTERN = /^\d{8,14}$/;
// Legacy tiles may drop `data-testid` during A/B tests but keep a canonical
// product URL of the form `/p/<slug>-<ean>`.
const EAN_FROM_SLUG = /-(\d{8,14})(?:[?#]|$)/;
const PDP_EAN = /\/p\/[^?#]*-(\d{8,14})(?:[?#]|$)/;

// Where we try to inject the badge, in priority order. Falls back to the
// article itself if none match. See carrefour-dom.md.
const BADGE_SLOTS = [
  '.product-list-card-plp-grid-new__flags',
  '.product-list-card-plp-grid-new__right-section',
];
const PANEL_SLOTS = ['.pdp-hero-wrapper__badges', '.pdp-hero-wrapper'];

export function extractProductsFromPage(root: ParentNode = document): ProductDomNode[] {
  const tiles = root.querySelectorAll<HTMLElement>('article[data-testid]');
  const nodes: ProductDomNode[] = [];
  for (const element of tiles) {
    const product = extractTile(element);
    if (product) nodes.push(product);
  }
  return nodes;
}

export function extractTile(element: HTMLElement): ProductDomNode | null {
  const ean = readEan(element);
  if (!ean) return null;

  const name = readName(element);
  if (!name) return null;

  const brand = readBrand(element);
  const href = readHref(element);

  const node: ProductDomNode = { element, ean, name };
  if (brand) node.brand = brand;
  if (href) node.href = href;
  return node;
}

function readEan(element: HTMLElement): string | null {
  const testId = element.getAttribute('data-testid');
  if (testId && EAN_PATTERN.test(testId)) return testId;

  const link = element.querySelector<HTMLAnchorElement>('a[href^="/p/"]');
  const href = link?.getAttribute('href');
  if (href) {
    const match = EAN_FROM_SLUG.exec(href);
    if (match && match[1]) return match[1];
  }
  return null;
}

function readName(element: HTMLElement): string {
  const heading = element.querySelector<HTMLElement>('h3.product-card-title__text, h3');
  const fromHeading = heading?.textContent?.trim();
  if (fromHeading) return fromHeading;

  // Last-resort: the tile image `alt`/`title` mirrors the product name.
  const img = element.querySelector<HTMLImageElement>('img.product-card-image-new__content, img');
  const fromImg =
    img?.getAttribute('title') ?? img?.getAttribute('alt')?.replace(/^image:\s*/i, '');
  return fromImg?.trim() ?? '';
}

function readBrand(element: HTMLElement): string | undefined {
  const brandLink = element.querySelector<HTMLElement>(
    'a.c-link--tone-accent.c-link--bold, a.c-link--tone-accent',
  );
  const text = brandLink?.textContent?.trim();
  return text ? text : undefined;
}

function readHref(element: HTMLElement): string | undefined {
  const link = element.querySelector<HTMLAnchorElement>('a[href^="/p/"]');
  const href = link?.getAttribute('href');
  return href ?? undefined;
}

/** Returns the main product's EAN from a Carrefour PDP URL, or null. */
export function extractPdpEan(url: string): string | null {
  const match = PDP_EAN.exec(url);
  return match ? match[1]! : null;
}

function findPanelSlot(): HTMLElement | null {
  for (const selector of PANEL_SLOTS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  const h1 = document.querySelector('h1');
  return h1?.parentElement ?? null;
}

export const carrefourRetailer: Retailer = {
  id: 'carrefour',
  extractProducts: extractProductsFromPage,
  findLiveTile: (node) =>
    document.querySelector<HTMLElement>(`article[data-testid="${CSS.escape(node.ean)}"]`),
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
