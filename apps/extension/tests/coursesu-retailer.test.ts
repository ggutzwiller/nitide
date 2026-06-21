import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  coursesuRetailer,
  extractPdpEan,
  extractProductsFromPage,
  extractTile,
} from '../src/content/coursesu/retailer.ts';

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

describe('extractProductsFromPage — real Courses U grid', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = mountFragment(loadFixture('coursesu-grid.html'));
  });

  it('extracts every product tile (63 in the fixture)', () => {
    expect(extractProductsFromPage(container)).toHaveLength(63);
  });

  it('reads a 13-digit EAN from data-item-ean on every tile', () => {
    const eans = extractProductsFromPage(container).map((t) => t.ean);
    for (const ean of eans) expect(ean).toMatch(/^\d{13}$/);
    expect(eans).toContain('3256220851145');
    expect(eans).toContain('3228857000852');
  });

  it('reads the product name, whitespace-collapsed', () => {
    const tiles = extractProductsFromPage(container);
    for (const tile of tiles) expect(tile.name.length).toBeGreaterThan(0);
    const pain = tiles.find((t) => t.ean === '3256220851145');
    expect(pain?.name).toContain('Pain de mie sans croûte Pur Mie nature');
    expect(pain?.name).not.toMatch(/\s{2,}/);
  });
});

describe('coursesuRetailer.findLiveTile', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('re-queries the live tile by EAN', () => {
    mountFragment(loadFixture('coursesu-grid.html'));
    const live = coursesuRetailer.findLiveTile({
      element: document.createElement('div'),
      ean: '3256220851145',
      name: 'x',
    });
    expect(live).not.toBeNull();
    expect(live!.getAttribute('data-item-ean')).toBe('3256220851145');
  });
});

describe('coursesuRetailer.findBadgeSlot', () => {
  it('returns a slot contained within the tile', () => {
    const container = mountFragment(loadFixture('coursesu-grid.html'));
    const tile = container.querySelector<HTMLElement>('div.product-tile[data-itemid]')!;
    const slot = coursesuRetailer.findBadgeSlot(tile);
    expect(tile.contains(slot)).toBe(true);
  });

  it('falls back to the tile when no known slot is present', () => {
    const tile = document.createElement('div');
    tile.setAttribute('data-itemid', '1');
    tile.setAttribute('data-item-ean', '3256220851145');
    expect(coursesuRetailer.findBadgeSlot(tile)).toBe(tile);
  });
});

describe('extractTile — defensive paths', () => {
  it('returns null when data-item-ean is missing', () => {
    const el = document.createElement('div');
    el.className = 'product-tile';
    el.setAttribute('data-itemid', '1');
    el.innerHTML = '<h2 class="product-name"><span class="name-link">Orphan</span></h2>';
    expect(extractTile(el)).toBeNull();
  });

  it('returns null when data-item-ean is not EAN-shaped', () => {
    const el = document.createElement('div');
    el.setAttribute('data-item-ean', 'abc');
    el.innerHTML = '<h2 class="product-name"><span class="name-link">X</span></h2>';
    expect(extractTile(el)).toBeNull();
  });

  it('returns null when no name can be found', () => {
    const el = document.createElement('div');
    el.setAttribute('data-item-ean', '3256220851145');
    expect(extractTile(el)).toBeNull();
  });
});

const PDP_URL = 'https://www.coursesu.com/p/pain-de-mie-harrys--500g/3551150.html';

describe('extractPdpEan — reads the main product EAN from the DOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the EAN of the product matching #pdpMain', () => {
    mountFragment(loadFixture('coursesu-product.html'));
    expect(extractPdpEan(PDP_URL)).toBe('3228857000852');
  });

  it('returns null on a listing URL even if tiles are present', () => {
    mountFragment(loadFixture('coursesu-grid.html'));
    expect(extractPdpEan('https://www.coursesu.com/c/pains-de-mie')).toBeNull();
  });

  it('returns null on a product URL with no matching data-tc-product-tile', () => {
    mountFragment('<div id="pdpMain" data-itemid="999999"></div>');
    expect(extractPdpEan(PDP_URL)).toBeNull();
  });
});

describe('coursesuRetailer.pdp.findPanelSlot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('anchors on the immediate container of h1.pdp-product-name', () => {
    mountFragment(loadFixture('coursesu-product.html'));
    const slot = coursesuRetailer.pdp!.findPanelSlot();
    expect(slot).not.toBeNull();
    // The slot must be the tight header block (title + review + icons), not a
    // distant layout wrapper: the product h1 is a direct child of it.
    const h1 = document.querySelector('h1.pdp-product-name')!;
    expect(slot).toBe(h1.parentElement);
    expect(slot!.classList.contains('pdp-name-review-icons')).toBe(true);
  });

  it('returns null when there is no product h1', () => {
    mountFragment('<div>no product here</div>');
    expect(coursesuRetailer.pdp!.findPanelSlot()).toBeNull();
  });
});
