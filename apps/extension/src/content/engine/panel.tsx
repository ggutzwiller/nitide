// Detailed Open Food Facts panel for the Carrefour product page (PDP), rendered
// with Preact inside a Shadow DOM (same isolation pattern as the tooltip).
// Structure mirrors the approved mockup (panel-preview.html). UI strings are
// French by design.
import { h, render } from 'preact';
import type { Level, ProductDetail } from '@nitide/core';
import {
  GREEN_SCORE_COLORS,
  NOVA_COLORS,
  NUTRI_SCORE_COLORS,
  NUTRIENT_LEVEL_COLOR,
  NUTRIENT_LEVEL_LABEL,
  contrastTextColor,
} from '../../shared/off-colors.ts';

export const PANEL_HOST_CLASS = 'nitide-detail-panel-host';

const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true" style="width:100%;height:100%">
  <rect width="64" height="64" rx="14" fill="#1F3D2B"/>
  <path d="M18 46 V18 L42 40 V18" stroke="#FAF6EE" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="46" cy="46" r="3" fill="#D4A24C"/></svg>`;

type PanelState = { kind: 'loading' } | { kind: 'product'; detail: ProductDetail };

/** Render (or update) the panel inside `slot`. Idempotent. */
export function renderPanel(slot: HTMLElement, state: PanelState): HTMLElement {
  // Reuse the existing host if there is one, else create it with its own Shadow DOM.
  let host = slot.querySelector<HTMLElement>(`.${PANEL_HOST_CLASS}`);
  let mount: HTMLElement;

  if (!host) {
    host = document.createElement('div');
    host.className = PANEL_HOST_CLASS;

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PANEL_STYLES;
    mount = document.createElement('div'); // Preact renders into this node
    shadow.append(style, mount);

    slot.appendChild(host);
  } else {
    mount = host.shadowRoot!.lastElementChild as HTMLElement;
  }

  render(h(PanelView, { state }), mount);
  return host;
}

/** Remove the panel from a slot (not-found / error / navigation away). */
export function removePanel(slot: HTMLElement): void {
  slot.querySelector(`.${PANEL_HOST_CLASS}`)?.remove();
}

function PanelView({ state }: { state: PanelState }) {
  return (
    <div class="panel">
      <header class="head">
        <span class="logo" dangerouslySetInnerHTML={{ __html: LOGO }} />
        <span class="title">
          Nitide
          {state.kind === 'product' && state.detail.brand ? (
            <small>{state.detail.brand}</small>
          ) : null}
        </span>
      </header>
      {state.kind === 'loading' ? <Loading /> : <Body detail={state.detail} />}
    </div>
  );
}

function Loading() {
  return (
    <div class="body loading">
      <span class="loadlogo" dangerouslySetInnerHTML={{ __html: LOGO }} />
      <p class="loadtext">Récupération des infos…</p>
    </div>
  );
}

function Body({ detail }: { detail: ProductDetail }) {
  return (
    <div class="body">
      <Grades detail={detail} />
      {detail.nutrientLevels ? <Levels levels={detail.nutrientLevels} /> : null}
      {detail.nutriments ? <Nutrition n={detail.nutriments} /> : null}
      <Characteristics detail={detail} />
      <footer class="foot">
        Source :{' '}
        <a href={detail.offUrl} target="_blank" rel="noopener noreferrer">
          Open Food Facts
        </a>
      </footer>
    </div>
  );
}

function Grades({ detail }: { detail: ProductDetail }) {
  const rows = [
    detail.nutriScore && {
      color: NUTRI_SCORE_COLORS[detail.nutriScore],
      v: detail.nutriScore.toUpperCase(),
      name: 'Nutri-Score',
      expl: 'Qualité nutritionnelle',
    },
    detail.greenScore && {
      color: GREEN_SCORE_COLORS[detail.greenScore],
      v: detail.greenScore.toUpperCase(),
      name: 'Green-Score',
      expl: 'Impact environnemental',
    },
    detail.nova && {
      color: NOVA_COLORS[detail.nova],
      v: String(detail.nova),
      name: 'Nova',
      expl: 'Degré de transformation (1 = brut)',
    },
  ].filter(Boolean) as { color: string; v: string; name: string; expl: string }[];

  return (
    <section class="section">
      <h3>Scores</h3>
      {rows.map((r) => (
        <div class="grade" key={r.name}>
          <span class="dot" style={{ background: r.color, color: contrastTextColor(r.color) }}>
            {r.v}
          </span>
          <span>
            <span class="gname">{r.name}</span>
            <br />
            <span class="gexpl">{r.expl}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

function Levels({ levels }: { levels: NonNullable<ProductDetail['nutrientLevels']> }) {
  const items: [string, Level | undefined][] = [
    ['Matières grasses', levels.fat],
    ['Saturés', levels.saturatedFat],
    ['Sucres', levels.sugars],
    ['Sel', levels.salt],
  ];
  const present = items.filter((entry): entry is [string, Level] => entry[1] !== undefined);
  return (
    <section class="section">
      <h3>Repères nutritionnels</h3>
      <div class="levels">
        {present.map(([name, l]) => (
          <div class="lvl" key={name}>
            <span class="swatch" style={{ background: NUTRIENT_LEVEL_COLOR[l] }} />
            <span class="lname">{name}</span>
            <span class="lval" style={{ color: NUTRIENT_LEVEL_COLOR[l] }}>
              {NUTRIENT_LEVEL_LABEL[l]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Nutrition({ n }: { n: NonNullable<ProductDetail['nutriments']> }) {
  const grams = (v?: number) => (v === undefined ? null : `${v.toLocaleString('fr-FR')} g`);
  const rows: [string, string | null][] = [
    ['Énergie', n.energyKcal === undefined ? null : `${n.energyKcal.toLocaleString('fr-FR')} kcal`],
    ['Matières grasses', grams(n.fat)],
    ['dont saturés', grams(n.saturatedFat)],
    ['Glucides', grams(n.carbohydrates)],
    ['dont sucres', grams(n.sugars)],
    ['Protéines', grams(n.proteins)],
    ['Sel', grams(n.salt)],
  ];
  const present = rows.filter((entry): entry is [string, string] => entry[1] !== null);
  if (present.length === 0) return null;
  // Collapsed by default: grocery sites already show the nutrition table, so we
  // keep it one click away rather than first-glance.
  return (
    <details class="section nutrition">
      <summary>Valeurs nutritionnelles / 100 g</summary>
      <table class="nutri-table">
        <tbody>
          {present.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Characteristics({ detail }: { detail: ProductDetail }) {
  const a = detail.analysis;
  const badges = [
    a?.vegan && 'Végan',
    a?.vegetarian && 'Végétarien',
    a?.palmOilFree && 'Sans huile de palme',
  ].filter(Boolean) as string[];
  if (!badges.length && !detail.additives && !detail.allergens) return null;
  return (
    <section class="section">
      <h3>Caractéristiques</h3>
      {badges.length ? (
        <div class="pills">
          {badges.map((b) => (
            <span class="pill" key={b}>
              {b}
            </span>
          ))}
        </div>
      ) : null}
      {detail.additives ? (
        <p class="listline">
          <b>Additifs :</b> {detail.additives.join(', ')}
        </p>
      ) : null}
      {detail.allergens ? (
        <p class="listline">
          <b>Allergènes :</b> {detail.allergens.join(', ')}
        </p>
      ) : null}
    </section>
  );
}

const PANEL_STYLES = /* css */ `
.panel {
  width: 320px;
  background: #fff;
  border: 1px solid #E5E1D6;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
  font-family: system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: #1A1A1A;
  /* lets descendant height: 0 -> auto transitions animate (Chrome) */
  interpolate-size: allow-keywords;
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #FAF6EE;
  border-bottom: 1px solid #E5E1D6;
}
.head .logo {
  width: 22px;
  height: 22px;
  flex: none;
}
.title {
  font-weight: 700;
  color: #1F3D2B;
}
.title small {
  display: block;
  font-weight: 500;
  color: #5C5C5C;
  font-size: 11px;
}

.body {
  padding: 14px 16px;
}
.body.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  padding: 28px 16px;
}
.loadlogo {
  width: 38px;
  height: 38px;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.94); }
}
.loadtext {
  color: #5C5C5C;
  font-size: 12.5px;
}

.section + .section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #F1ECE0;
}
.section h3 {
  margin: 0 0 10px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #5C5C5C;
}

/* Collapsible nutrition section (collapsed by default) */
.nutrition > summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #5C5C5C;
}
.nutrition > summary::-webkit-details-marker {
  display: none;
}
.nutrition > summary::after {
  content: '\\25BE';
  display: inline-block;
  transition: transform 0.15s ease;
}
.nutrition[open] > summary {
  margin-bottom: 10px;
}
.nutrition[open] > summary::after {
  transform: rotate(180deg);
}
/* Light open/close animation (Chrome ::details-content; instant fallback elsewhere) */
.nutrition::details-content {
  height: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    height 0.22s ease,
    opacity 0.22s ease,
    content-visibility 0.22s allow-discrete;
}
.nutrition[open]::details-content {
  height: auto;
  opacity: 1;
}

/* Score grades */
.grade {
  display: flex;
  align-items: center;
  gap: 11px;
}
.grade + .grade {
  margin-top: 10px;
}
.grade .dot {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 16px;
}
.gname {
  font-weight: 700;
}
.gexpl {
  color: #5C5C5C;
  font-size: 12px;
}

/* Nutrient levels (traffic-light pills) */
.levels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.lvl {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 9px;
  background: #FAF6EE;
}
.lvl .swatch {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  flex: none;
}
.lvl .lname {
  flex: 1;
  font-size: 12px;
}
.lvl .lval {
  font-size: 11px;
  font-weight: 700;
}

/* Nutrition facts table */
.nutri-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.nutri-table td {
  padding: 4px 0;
  border-bottom: 1px solid #F4EFE4;
}
.nutri-table td:last-child {
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.nutri-table tr:last-child td {
  border-bottom: none;
}

/* Diet badges + additives/allergens */
.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.pill {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  background: #EEF3EC;
  color: #1F3D2B;
  border: 1px solid #DDE6D8;
}
.listline {
  font-size: 12px;
  color: #5C5C5C;
  margin: 4px 0 0;
}
.listline b {
  color: #1A1A1A;
  font-weight: 600;
}

.foot {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #E5E1D6;
  font-size: 11px;
  color: #5C5C5C;
}
.foot a {
  color: #1F3D2B;
  font-weight: 600;
}
`;
