// Intermarché adapter: all the intermarche.com DOM specifics in one place.
//
// On a listing page (www.intermarche.com/boutique/..., /rayon..., search) every
// product tile is `[data-testid="product-layout"]`. The EAN is the last path
// segment of the product link, e.g. `/produit/jus-de-pomme/3250390866442`. The
// site is a Next.js SPA, so the shared engine handles navigation/hydration.
//
// Product pages share the same URL shape (`/produit/<slug>/<ean>`), so the PDP
// panel reuses the listing EAN logic and anchors on the product `<h1>`.

import type { ProductDomNode, Retailer } from '../engine/types.ts';

const EAN_PATTERN = /^\d{8,14}$/;
const TILE_SELECTOR = '[data-testid="product-layout"]';
// PDP URLs are `/produit/<slug>/<ean>`; the EAN is the trailing path segment.
const PDP_EAN = /\/produit\/[^?#]*\/(\d{8,14})(?:[?#]|$)/;

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
  const href = readHref(element);
  const ean = href ? eanFromHref(href) : null;
  if (!ean) return null;

  const name = readName(element);
  if (!name) return null;

  const brand = readBrand(element);

  const node: ProductDomNode = { element, ean, name, href };
  if (brand) node.brand = brand;
  return node;
}

/** Last path segment of a `/produit/.../<ean>` href, if it looks like an EAN. */
function eanFromHref(href: string): string | null {
  const path = href.split(/[?#]/)[0] ?? '';
  const segment = path.split('/').filter(Boolean).pop();
  return segment && EAN_PATTERN.test(segment) ? segment : null;
}

function readHref(element: HTMLElement): string | undefined {
  const link = element.querySelector<HTMLAnchorElement>('a[href^="/produit/"]');
  return link?.getAttribute('href') ?? undefined;
}

function readName(element: HTMLElement): string {
  const title = element.querySelector<HTMLElement>('.stime-product--details__title');
  return title?.textContent?.trim() ?? '';
}

function readBrand(element: HTMLElement): string | undefined {
  // The brand sits in the first column of the summary block (e.g. "Pâturages,
  // une marque Intermarché"); the title/packaging live in the second column.
  const brand = element.querySelector<HTMLElement>(
    '.stime-product--details__summary > div:first-child p',
  );
  const text = brand?.textContent?.trim();
  return text ? text : undefined;
}

/** Returns the main product's EAN from an Intermarché PDP URL, or null. */
export function extractPdpEan(url: string): string | null {
  const match = PDP_EAN.exec(url);
  return match ? match[1]! : null;
}

/**
 * Where to mount the detail panel. The hero renders the summary card twice (a
 * `md:hidden` mobile twin and a desktop twin), each carrying the product `<h1>`.
 * Classes are generated Tailwind with no stable hook, so we anchor on the title:
 * prefer the visible twin (the hidden one has no `offsetParent` once CSS applies),
 * fall back to the last in DOM, and mount inside its card next to the native
 * Nutri-Score.
 */
function findPanelSlot(): HTMLElement | null {
  const titles = Array.from(document.querySelectorAll<HTMLElement>('main h1'));
  const target = titles.find((h) => h.offsetParent !== null) ?? titles.at(-1);
  return target?.closest('div') ?? target?.parentElement ?? null;
}

export const intermarcheRetailer: Retailer = {
  id: 'intermarche',
  extractProducts: extractProductsFromPage,
  findLiveTile: (node) => {
    const safe = CSS.escape(node.ean);
    return document.querySelector<HTMLElement>(
      `${TILE_SELECTOR}:has(a[href$="/${safe}"])`,
    );
  },
  findBadgeSlot: (tile) =>
    tile.querySelector<HTMLElement>('.stime-product--details__summary') ??
    tile.querySelector<HTMLElement>('.stime-product-card-course') ??
    tile,
  pdp: {
    extractEan: extractPdpEan,
    findPanelSlot,
  },
};
