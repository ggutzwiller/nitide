import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractPdpEan,
  extractProductsFromPage,
  extractTile,
  intermarcheRetailer,
} from '../src/content/intermarche/retailer.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '../docs/fixtures');

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf8');
}

function mountFragment(html: string): HTMLDivElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

describe('extractProductsFromPage — real Intermarché grid', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = mountFragment(loadFixture('intermarche-grid.html'));
  });

  it('extracts every tile (4 products in the fixture)', () => {
    expect(extractProductsFromPage(container)).toHaveLength(4);
  });

  it('reads the EAN from the last segment of the product link', () => {
    const eans = extractProductsFromPage(container).map((t) => t.ean);
    for (const ean of eans) {
      expect(ean).toMatch(/^\d{13}$/);
    }
    expect(eans).toContain('3250391535583');
    expect(eans).toContain('3250390866442');
  });

  it('reads the product name from the title heading', () => {
    const tiles = extractProductsFromPage(container);
    for (const tile of tiles) {
      expect(tile.name.length).toBeGreaterThan(0);
    }
    const paturette = tiles.find((t) => t.ean === '3250391535583');
    expect(paturette?.name).toBe('Paturette - Crème dessert chocolat noir');
  });

  it('exposes the brand from the summary block', () => {
    const tiles = extractProductsFromPage(container);
    const paturette = tiles.find((t) => t.ean === '3250391535583');
    expect(paturette?.brand).toBe('Pâturages, une marque Intermarché');
    expect(tiles.every((t) => t.brand)).toBe(true);
  });

  it('keeps the product href for reference', () => {
    const tiles = extractProductsFromPage(container);
    const jus = tiles.find((t) => t.ean === '3250390866442');
    expect(jus?.href).toBe('/produit/jus-de-pomme/3250390866442');
  });
});

describe('intermarcheRetailer.findBadgeSlot', () => {
  it('returns the summary block, contained within the tile', () => {
    const container = mountFragment(loadFixture('intermarche-grid.html'));
    const tile = container.querySelector<HTMLElement>('[data-testid="product-layout"]')!;
    const slot = intermarcheRetailer.findBadgeSlot(tile);
    expect(slot.classList.contains('stime-product--details__summary')).toBe(true);
    expect(tile.contains(slot)).toBe(true);
  });

  it('falls back to the tile when no known slot is present', () => {
    const tile = document.createElement('div');
    tile.setAttribute('data-testid', 'product-layout');
    expect(intermarcheRetailer.findBadgeSlot(tile)).toBe(tile);
  });
});

describe('extractTile — defensive paths', () => {
  it('returns null when there is no /produit/ link', () => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'product-layout');
    el.innerHTML = '<h2 class="stime-product--details__title">Orphan</h2>';
    expect(extractTile(el)).toBeNull();
  });

  it('returns null when the link has no EAN-like last segment', () => {
    const el = document.createElement('div');
    el.innerHTML =
      '<a href="/produit/just-a-slug"><h2 class="stime-product--details__title">No ean</h2></a>';
    expect(extractTile(el)).toBeNull();
  });

  it('returns null when no name can be found', () => {
    const el = document.createElement('div');
    el.innerHTML = '<a href="/produit/x/3250391535583"></a>';
    expect(extractTile(el)).toBeNull();
  });

  it('ignores query and hash suffixes on the href', () => {
    const el = document.createElement('div');
    el.innerHTML =
      '<a href="/produit/x/3250391535583?foo=1#bar"><h2 class="stime-product--details__title">X</h2></a>';
    expect(extractTile(el)?.ean).toBe('3250391535583');
  });
});

describe('extractPdpEan', () => {
  it('extracts the EAN from a product URL', () => {
    expect(extractPdpEan('https://www.intermarche.com/produit/cookies-maxi/3250393471643')).toBe(
      '3250393471643',
    );
  });

  it('handles query/hash suffixes', () => {
    expect(extractPdpEan('https://www.intermarche.com/produit/x/3250393471643?utm=1#avis')).toBe(
      '3250393471643',
    );
  });

  it('returns null on listing and non-product pages', () => {
    expect(extractPdpEan('https://www.intermarche.com/boutique/3056')).toBeNull();
    expect(extractPdpEan('https://www.intermarche.com/produit/just-a-slug')).toBeNull();
  });
});

describe('intermarcheRetailer.pdp.findPanelSlot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('anchors on a summary card holding the product <h1>', () => {
    mountFragment(loadFixture('intermarche-product.html'));
    const slot = intermarcheRetailer.pdp!.findPanelSlot();
    expect(slot).not.toBeNull();
    // The card is one of the responsive twins (which one is browser-only: it
    // depends on layout-based visibility, which jsdom does not compute).
    expect(slot!.getAttribute('data-twin')).toMatch(/^(mobile|desktop)$/);
    expect(slot!.querySelector('h1')).not.toBeNull();
  });

  it('returns null when there is no product <h1>', () => {
    mountFragment('<main><div>no product here</div></main>');
    expect(intermarcheRetailer.pdp!.findPanelSlot()).toBeNull();
  });
});
