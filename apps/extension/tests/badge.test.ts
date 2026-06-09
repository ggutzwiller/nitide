import { beforeEach, describe, expect, it } from 'vitest';
import type { Product } from '@nitide/core';
import { renderBadge } from '../src/content/engine/badge.ts';

// Mirrors the Carrefour slot logic: prefer the __flags slot, fall back to the tile.
const findSlot = (tile: HTMLElement): HTMLElement =>
  tile.querySelector<HTMLElement>('.product-list-card-plp-grid-new__flags') ?? tile;

const FULL_PRODUCT: Product = {
  ean: '3017620422003',
  name: 'Nutella',
  brand: 'Ferrero',
  nutriScore: 'e',
  greenScore: 'c',
  nova: 4,
  offUrl: 'https://world.openfoodfacts.org/product/3017620422003',
};

function buildTile(): HTMLElement {
  const article = document.createElement('article');
  article.setAttribute('data-testid', '3017620422003');
  article.className = 'product-list-card-plp-grid-new';
  const flags = document.createElement('div');
  flags.className = 'product-list-card-plp-grid-new__flags';
  article.appendChild(flags);
  document.body.appendChild(article);
  return article;
}

describe('renderBadge', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders three cells when all three scores are present', () => {
    const tile = buildTile();
    renderBadge(tile, FULL_PRODUCT, findSlot);

    const host = tile.querySelector('span.nitide-badges-host');
    expect(host).not.toBeNull();
    const shadow = host!.shadowRoot!;
    const cells = shadow.querySelectorAll('.cell');
    expect(cells).toHaveLength(3);

    const kinds = Array.from(cells).map((el) => (el as HTMLElement).dataset['kind']);
    expect(kinds).toEqual(['nutri', 'green', 'nova']);
  });

  it('surfaces a short kind label under each score', () => {
    const tile = buildTile();
    renderBadge(tile, FULL_PRODUCT, findSlot);
    const shadow = tile.querySelector('span.nitide-badges-host')!.shadowRoot!;
    const labels = Array.from(shadow.querySelectorAll<HTMLElement>('.lbl')).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(['Nutri', 'Green', 'Nova']);
  });

  it('omits missing scores instead of rendering empty cells', () => {
    const tile = buildTile();
    renderBadge(tile, { ...FULL_PRODUCT, greenScore: null, nova: null }, findSlot);

    const shadow = tile.querySelector('span.nitide-badges-host')!.shadowRoot!;
    expect(shadow.querySelectorAll('.cell')).toHaveLength(1);
  });

  it('does nothing when the product is null', () => {
    const tile = buildTile();
    renderBadge(tile, null, findSlot);
    expect(tile.querySelector('span.nitide-badges-host')).toBeNull();
  });

  it('clears a previous badge when re-rendered with null', () => {
    const tile = buildTile();
    renderBadge(tile, FULL_PRODUCT, findSlot);
    expect(tile.querySelector('span.nitide-badges-host')).not.toBeNull();
    renderBadge(tile, null, findSlot);
    expect(tile.querySelector('span.nitide-badges-host')).toBeNull();
  });

  it('replaces the previous badge on a re-render (idempotent)', () => {
    const tile = buildTile();
    renderBadge(tile, FULL_PRODUCT, findSlot);
    renderBadge(tile, { ...FULL_PRODUCT, nutriScore: 'a' }, findSlot);

    const hosts = tile.querySelectorAll('span.nitide-badges-host');
    expect(hosts).toHaveLength(1);
    const cell = hosts[0]!.shadowRoot!.querySelector<HTMLElement>('.cell[data-kind="nutri"]');
    const dot = cell?.querySelector<HTMLElement>('.dot');
    expect(dot?.textContent).toBe('A');
  });

  it('prefers the __flags slot when available, falls back to the article', () => {
    const tile = buildTile();
    renderBadge(tile, FULL_PRODUCT, findSlot);
    const flags = tile.querySelector('.product-list-card-plp-grid-new__flags')!;
    expect(flags.querySelector('span.nitide-badges-host')).not.toBeNull();

    // Remove the slot and rerender: should land directly on the article.
    flags.remove();
    renderBadge(tile, FULL_PRODUCT, findSlot);
    expect(tile.querySelector('span.nitide-badges-host')?.parentElement).toBe(tile);
  });
});
