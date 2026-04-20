// Singleton tooltip rendered in a body-level Shadow DOM, driven by Preact.
// `showTooltip(product, anchor)` anchors it near the hovered badge;
// `hideTooltip()` tears it down after a short grace period so the user can
// move between adjacent badges without flicker.

import { h, render } from 'preact';
import type { Product } from '@nitide/core';
import {
  GREEN_SCORE_COLORS,
  GREEN_SCORE_HINT,
  NOVA_COLORS,
  NOVA_LABEL,
  NUTRI_SCORE_COLORS,
  NUTRI_SCORE_HINT,
  contrastTextColor,
} from '../../shared/off-colors.ts';

const HOST_ID = 'nitide-tooltip-host';
const GRACE_MS = 120;

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let hostRef: HTMLDivElement | null = null;

export function showTooltip(product: Product, anchor: HTMLElement): void {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  const host = ensureHost();
  const shadow = host.shadowRoot!;
  const target = shadow.querySelector<HTMLDivElement>('#root')!;

  render(h(TooltipView, { product }), target);

  positionAt(host, anchor);
  host.style.visibility = 'visible';
  host.style.opacity = '1';
}

export function hideTooltip(): void {
  if (hideTimer) return;
  hideTimer = setTimeout(() => {
    if (hostRef) {
      hostRef.style.opacity = '0';
      hostRef.style.visibility = 'hidden';
    }
    hideTimer = null;
  }, GRACE_MS);
}

function ensureHost(): HTMLDivElement {
  if (hostRef && hostRef.isConnected) return hostRef;
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.top = '0';
  host.style.left = '0';
  host.style.pointerEvents = 'none';
  host.style.transition = 'opacity 140ms ease';
  host.style.opacity = '0';
  host.style.visibility = 'hidden';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = TOOLTIP_STYLES;
  const root = document.createElement('div');
  root.id = 'root';
  shadow.appendChild(style);
  shadow.appendChild(root);

  document.body.appendChild(host);
  hostRef = host;
  return host;
}

function positionAt(host: HTMLDivElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  const width = 300;

  let left = rect.left + rect.width / 2 - width / 2;
  left = Math.max(margin, Math.min(window.innerWidth - width - margin, left));
  const top = rect.bottom + margin;

  host.style.left = `${left}px`;
  host.style.top = `${top}px`;
  host.style.width = `${width}px`;
}

function TooltipView({ product }: { product: Product }) {
  return (
    <div class="card" role="tooltip">
      <header class="head">
        <p class="name">{product.name}</p>
        {product.brand ? <p class="brand">{product.brand}</p> : null}
      </header>
      <ul class="scores">
        {product.nutriScore ? (
          <ScoreRow
            label="Nutri-Score"
            value={product.nutriScore.toUpperCase()}
            color={NUTRI_SCORE_COLORS[product.nutriScore]}
            hint={NUTRI_SCORE_HINT}
          />
        ) : null}
        {product.greenScore ? (
          <ScoreRow
            label="Green-Score"
            value={product.greenScore.toUpperCase()}
            color={GREEN_SCORE_COLORS[product.greenScore]}
            hint={GREEN_SCORE_HINT}
          />
        ) : null}
        {product.nova ? (
          <ScoreRow
            label="Nova"
            value={`Groupe ${product.nova}`}
            color={NOVA_COLORS[product.nova]}
            hint={NOVA_LABEL[product.nova]}
          />
        ) : null}
      </ul>
      <footer class="foot">
        Source :{' '}
        <a href={product.offUrl} target="_blank" rel="noopener noreferrer">
          Open Food Facts
        </a>
      </footer>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color: string;
  hint?: string;
}) {
  return (
    <li class="row">
      <span class="pill" style={{ background: color, color: contrastTextColor(color) }}>
        {value}
      </span>
      <span class="label">
        <span class="label-name">{label}</span>
        {hint ? <span class="hint">{hint}</span> : null}
      </span>
    </li>
  );
}

const TOOLTIP_STYLES = /* css */ `
:host, #root { pointer-events: auto; }
.card {
  background: #FFFFFF;
  color: #1A1A1A;
  border: 1px solid #E5E1D6;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
  padding: 14px 16px;
  font-family: system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif;
  font-size: 13px;
  line-height: 1.4;
}
.head {
  margin-bottom: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #F1ECE0;
}
.name {
  margin: 0;
  font-weight: 600;
  color: #1F3D2B;
  font-size: 14px;
}
.brand {
  margin: 3px 0 0;
  font-size: 10.5px;
  color: #5C5C5C;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.scores {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 24px;
  padding: 0 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    inset 0 -1px 0 rgba(0, 0, 0, 0.10);
}
.label {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.label-name {
  font-size: 12px;
  font-weight: 600;
  color: #1A1A1A;
  line-height: 1.25;
}
.hint {
  font-size: 11px;
  color: #5C5C5C;
  line-height: 1.35;
  margin-top: 2px;
}
.foot {
  margin: 12px 0 0;
  padding-top: 10px;
  border-top: 1px solid #F1ECE0;
  font-size: 11px;
  color: #5C5C5C;
}
.foot a {
  color: #1F3D2B;
  text-decoration: underline;
  text-decoration-color: #7A9E7E;
  text-underline-offset: 3px;
  transition: text-decoration-color 150ms ease;
}
.foot a:hover {
  text-decoration-color: #D4A24C;
}
`;
