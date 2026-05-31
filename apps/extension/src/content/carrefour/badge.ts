// Injects three mini-badges (Nutri-Score, Green-Score, Nova) inside a Carrefour
// product tile. Styles live in a Shadow DOM so Carrefour's CSS can't touch us
// and vice-versa.

import type { GreenScore, NovaGroup, NutriScore, Product } from '@nitide/core';
import {
  GREEN_SCORE_COLORS,
  NOVA_COLORS,
  NUTRI_SCORE_COLORS,
  SCORE_KIND_SHORT,
  contrastTextColor,
} from '../../shared/off-colors.ts';
import { showTooltip, hideTooltip } from './tooltip.tsx';

const HOST_CLASS = 'nitide-badges-host';
// Where we try to inject, in priority order. Falls back to appending to the
// article itself if none match, see carrefour-dom.md.
const PREFERRED_SLOTS = [
  '.product-list-card-plp-grid-new__flags',
  '.product-list-card-plp-grid-new__right-section',
];

const SHADOW_STYLES = /* css */ `
:host {
  display: inline-block;
  margin-top: 8px;
}
.unit {
  display: inline-flex;
  align-items: stretch;
  background: #FAF6EE;
  border: 1px solid #E5E1D6;
  border-radius: 12px;
  overflow: hidden;
  cursor: help;
  user-select: none;
  font-family: system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition:
    transform 180ms ease,
    box-shadow 180ms ease;
}
.unit:hover,
.unit:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.13);
}
.unit:focus {
  outline: none;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 7px 11px;
}
.cell + .cell {
  border-left: 1px solid #E5E1D6;
}
.dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    inset 0 -1px 0 rgba(0, 0, 0, 0.12);
}
.lbl {
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #5C5C5C;
  line-height: 1;
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
 * Renders the three Nitide badges on a tile. Idempotent, rerunning against
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

  const unit = document.createElement('div');
  unit.className = 'unit';
  unit.tabIndex = 0;
  unit.setAttribute('role', 'group');
  unit.setAttribute('aria-label', 'Scores Open Food Facts');
  for (const chip of chips) {
    unit.appendChild(buildCellElement(chip));
  }
  shadow.appendChild(unit);

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
    ariaLabel: `Nova group ${group}`,
  };
}

function buildCellElement(config: ChipConfig): HTMLSpanElement {
  const cell = document.createElement('span');
  cell.className = 'cell';
  cell.dataset['kind'] = config.kind;
  cell.setAttribute('role', 'img');
  cell.setAttribute('aria-label', config.ariaLabel);

  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = config.background;
  dot.style.color = contrastTextColor(config.background);
  dot.textContent = config.label;

  const label = document.createElement('span');
  label.className = 'lbl';
  label.textContent = SCORE_KIND_SHORT[config.kind];

  cell.appendChild(dot);
  cell.appendChild(label);
  return cell;
}

function attachHoverHandlers(host: HTMLElement, product: Product): void {
  host.addEventListener('mouseenter', () => showTooltip(product, host));
  host.addEventListener('mouseleave', () => hideTooltip());
  host.addEventListener('focusin', () => showTooltip(product, host));
  host.addEventListener('focusout', () => hideTooltip());
}
