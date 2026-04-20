// Extracts product tiles from a Carrefour listing page.
//
// The parser is deliberately narrow: it targets `article` elements whose
// `data-testid` matches an EAN-13-ish barcode pattern. On Carrefour every
// product tile in a PLP carries that attribute, and the attribute value *is*
// the EAN — so we never need to fall back on text search. See
// `apps/extension/docs/carrefour-dom.md` for the full DOM analysis.

export interface ProductDomNode {
  element: HTMLElement;
  ean: string;
  name: string;
  brand?: string;
  href?: string;
}

const EAN_PATTERN = /^\d{8,14}$/;
// Kept for legacy tiles that may drop `data-testid` during A/B tests but keep
// a canonical product URL of the form `/p/<slug>-<ean>`.
const EAN_FROM_SLUG = /-(\d{8,14})(?:[?#]|$)/;

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
