// Shared contracts for the retailer-agnostic content-script engine.
//
// A `Retailer` encapsulates everything DOM-specific about one grocery site:
// how to find product tiles, where to inject a badge, how to re-query a tile
// after the SPA swaps it, and (optionally) how to drive the product-page panel.
// The engine (scheduler, runtime, badge, pdp) is built once against this
// interface and reused across sites.

/** A product tile extracted from a listing page. */
export interface ProductDomNode {
  element: HTMLElement;
  ean: string;
  name: string;
  brand?: string;
  href?: string;
}

/** Product-detail-page hooks. Present only on retailers that support a panel. */
export interface RetailerPdp {
  /** Main product's EAN from a page URL, or null when off a product page. */
  extractEan(url: string): string | null;
  /** Where to mount the detail panel on the current page, or null. */
  findPanelSlot(): HTMLElement | null;
}

/** Per-site adapter: the only place DOM selectors and URL shapes live. */
export interface Retailer {
  readonly id: string;
  /** Extract product tiles from a listing page (defaults to `document`). */
  extractProducts(root: ParentNode): ProductDomNode[];
  /** Re-query the live tile element (the SPA may have replaced the node). */
  findLiveTile(node: ProductDomNode): HTMLElement | null;
  /** Where, inside a tile, to inject the badge host. */
  findBadgeSlot(tile: HTMLElement): HTMLElement;
  /** Product-page support. Absent means: list badges only, no panel. */
  pdp?: RetailerPdp;
}
