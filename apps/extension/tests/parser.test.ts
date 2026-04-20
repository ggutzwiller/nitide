import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { extractProductsFromPage, extractTile } from '../src/content/carrefour/parser.ts';

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

describe('extractProductsFromPage — real Carrefour grid', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = mountFragment(loadFixture('search-grid.html'));
  });

  it('extracts every tile (37 products in the fixture)', () => {
    const tiles = extractProductsFromPage(container);
    expect(tiles).toHaveLength(37);
  });

  it('captures the EAN straight from data-testid', () => {
    const tiles = extractProductsFromPage(container);
    const eans = tiles.map((t) => t.ean);
    for (const ean of eans) {
      expect(ean).toMatch(/^\d{13}$/);
    }
    expect(eans).toContain('3560070546879');
    expect(eans).toContain('3560070328826');
  });

  it('reads the product name from the h3 title', () => {
    const tiles = extractProductsFromPage(container);
    for (const tile of tiles) {
      expect(tile.name.length).toBeGreaterThan(0);
    }
  });

  it('exposes a brand for the tiles that advertise one', () => {
    const tiles = extractProductsFromPage(container);
    const withBrand = tiles.filter((t) => t.brand);
    // Most branded tiles surface a brand link; the fixture has plenty.
    expect(withBrand.length).toBeGreaterThan(10);
  });

  it('returns an HTMLElement usable for injection', () => {
    const tiles = extractProductsFromPage(container);
    for (const tile of tiles) {
      expect(tile.element.tagName).toBe('ARTICLE');
      expect(tile.element.isConnected).toBe(true);
    }
  });
});

describe('extractProductsFromPage — single tile fixture', () => {
  it('parses the tile-single.html fixture end-to-end', () => {
    document.body.innerHTML = '';
    const container = mountFragment(loadFixture('tile-single.html'));
    const tiles = extractProductsFromPage(container);
    expect(tiles).toHaveLength(1);
    const tile = tiles[0]!;
    expect(tile.ean).toBe('3560070546879');
    expect(tile.name).toBe("Pâtes pipe rigate CARREFOUR CLASSIC'");
    expect(tile.brand).toBe("CARREFOUR CLASSIC'");
    expect(tile.href).toBe('/p/pates-pipe-rigate-carrefour-classic-3560070546879');
  });
});

describe('extractTile — defensive paths', () => {
  it('returns null when data-testid is not an EAN', () => {
    const el = document.createElement('article');
    el.setAttribute('data-testid', 'not-a-barcode');
    expect(extractTile(el)).toBeNull();
  });

  it('falls back to the product URL slug when data-testid is missing', () => {
    const el = document.createElement('article');
    el.innerHTML = `
      <a href="/p/some-product-3017620422003" class="c-link">
        <h3 class="product-card-title__text">Some product</h3>
      </a>
    `;
    const tile = extractTile(el);
    expect(tile?.ean).toBe('3017620422003');
  });

  it('returns null when no name can be found', () => {
    const el = document.createElement('article');
    el.setAttribute('data-testid', '3017620422003');
    expect(extractTile(el)).toBeNull();
  });

  it('falls back to the image title when the h3 is missing', () => {
    const el = document.createElement('article');
    el.setAttribute('data-testid', '3017620422003');
    el.innerHTML = '<img title="Nutella" alt="image: Nutella">';
    const tile = extractTile(el);
    expect(tile?.name).toBe('Nutella');
  });
});
