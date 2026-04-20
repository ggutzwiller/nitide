// Injects three mini-badges (Nutri-Score, Green-Score, Nova) inside a Carrefour
// product tile. Styles live in a Shadow DOM so Carrefour's CSS can't touch us
// and vice-versa.

import type { GreenScore, NovaGroup, NutriScore, Product } from '@nitide/core';
import {
  GREEN_SCORE_COLORS,
  NOVA_COLORS,
  NUTRI_SCORE_COLORS,
  SCORE_KIND_LABEL,
  contrastTextColor,
} from '../../shared/off-colors.ts';
import { showTooltip, hideTooltip } from './tooltip.tsx';

const HOST_CLASS = 'nitide-badges-host';
// Where we try to inject, in priority order. Falls back to appending to the
// article itself if none match — see carrefour-dom.md.
const PREFERRED_SLOTS = [
  '.product-list-card-plp-grid-new__flags',
  '.product-list-card-plp-grid-new__right-section',
];

const SHADOW_STYLES = /* css */ `
:host {
  display: inline-block;
  margin-top: 8px;
}
.row {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: center;
  font-family: system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif;
}
.pair {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: help;
}
.kind {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #5C5C5C;
  line-height: 1;
}
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 8px;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
  user-select: none;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    inset 0 -1px 0 rgba(0, 0, 0, 0.10);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease;
}
.pair:hover .chip,
.pair:focus-within .chip {
  transform: translateY(-1px);
  box-shadow:
    0 4px 10px rgba(0, 0, 0, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    inset 0 -1px 0 rgba(0, 0, 0, 0.12);
}
`;

type ChipKind = 'nutri' | 'green' | 'nova';

interface ChipConfig {
  kind: ChipKind;
  label: string;
  background: string;
  ariaLabel: string;
}

/**
 * Renders the three Nitide badges on a tile. Idempotent — rerunning against
 * the same `element` replaces the previous render so updates (or retries) are
 * safe.
 *
 * When `product` is `null` we bail out silently: PROJECT.md wants "no badge"
 * rather than a placeholder when OFF has no data for the product.
 */
export function renderBadge(element: HTMLElement, product: Product | null): void {
  removeExistingBadge(element);
  if (!product) return;

  const chips = buildChips(product);
  if (chips.length === 0) return;

  const host = document.createElement('span');
  host.className = HOST_CLASS;
  host.dataset['nitideEan'] = product.ean ?? '';

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = SHADOW_STYLES;
  shadow.appendChild(style);

  const row = document.createElement('div');
  row.className = 'row';
  for (const chip of chips) {
    row.appendChild(buildPairElement(chip));
  }
  shadow.appendChild(row);

  attachHoverHandlers(host, product);

  const slot = findSlot(element);
  slot.appendChild(host);
}

function removeExistingBadge(element: HTMLElement): void {
  const previous = element.querySelectorAll<HTMLElement>(`span.${HOST_CLASS}`);
  for (const node of previous) node.remove();
}

function findSlot(element: HTMLElement): HTMLElement {
  for (const selector of PREFERRED_SLOTS) {
    const slot = element.querySelector<HTMLElement>(selector);
    if (slot) return slot;
  }
  return element;
}

function buildChips(product: Product): ChipConfig[] {
  const chips: ChipConfig[] = [];
  if (product.nutriScore) chips.push(nutriChip(product.nutriScore));
  if (product.greenScore) chips.push(greenChip(product.greenScore));
  if (product.nova) chips.push(novaChip(product.nova));
  return chips;
}

function nutriChip(grade: NutriScore): ChipConfig {
  return {
    kind: 'nutri',
    label: grade.toUpperCase(),
    background: NUTRI_SCORE_COLORS[grade],
    ariaLabel: `Nutri-Score ${grade.toUpperCase()}`,
  };
}

function greenChip(grade: GreenScore): ChipConfig {
  return {
    kind: 'green',
    label: grade.toUpperCase(),
    background: GREEN_SCORE_COLORS[grade],
    ariaLabel: `Green-Score ${grade.toUpperCase()}`,
  };
}

function novaChip(group: NovaGroup): ChipConfig {
  return {
    kind: 'nova',
    label: String(group),
    background: NOVA_COLORS[group],
    ariaLabel: `Nova groupe ${group}`,
  };
}

function buildPairElement(config: ChipConfig): HTMLSpanElement {
  const pair = document.createElement('span');
  pair.className = 'pair';
  pair.dataset['kind'] = config.kind;
  pair.setAttribute('role', 'img');
  pair.setAttribute('aria-label', config.ariaLabel);
  pair.tabIndex = 0;

  const label = document.createElement('span');
  label.className = 'kind';
  label.textContent = SCORE_KIND_LABEL[config.kind];

  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.style.background = config.background;
  chip.style.color = contrastTextColor(config.background);
  chip.textContent = config.label;

  pair.appendChild(label);
  pair.appendChild(chip);
  return pair;
}

function attachHoverHandlers(host: HTMLElement, product: Product): void {
  host.addEventListener('mouseenter', () => showTooltip(product, host));
  host.addEventListener('mouseleave', () => hideTooltip());
  host.addEventListener('focusin', () => showTooltip(product, host));
  host.addEventListener('focusout', () => hideTooltip());
}
