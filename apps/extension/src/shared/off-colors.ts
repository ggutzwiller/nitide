// Official Open Food Facts brand colors for the three score families.
// These are what OFF itself uses on its site and in its badges; we reuse them
// so users recognise the grades at a glance.

import type { GreenScore, Level, NovaGroup, NutriScore } from '@nitide/core';

export const NUTRI_SCORE_COLORS: Record<NutriScore, string> = {
  a: '#008240',
  b: '#85BB2F',
  c: '#FECB02',
  d: '#EE8100',
  e: '#E63312',
};

export const GREEN_SCORE_COLORS: Record<GreenScore, string> = {
  a: '#1E8F4E',
  b: '#78B14F',
  c: '#CEC92A',
  d: '#EF7D17',
  e: '#E8471B',
};

export const NOVA_COLORS: Record<NovaGroup, string> = {
  1: '#448747',
  2: '#94A133',
  3: '#F39400',
  4: '#E73834',
};

export const NOVA_LABEL: Record<NovaGroup, string> = {
  1: 'Aliments peu ou pas transformés',
  2: 'Ingrédients culinaires transformés',
  3: 'Aliments transformés',
  4: 'Aliments ultra-transformés',
};

/**
 * Shown as a subtitle under the Nutri-Score row in the tooltip.
 */
export const NUTRI_SCORE_HINT = 'Qualité nutritionnelle (A = meilleure, E = à éviter)';

/**
 * Shown as a subtitle under the Green-Score row in the tooltip. Green-Score
 * is less well-known than Nutri-Score so we spell out what it measures.
 */
export const GREEN_SCORE_HINT =
  'Impact environnemental : émissions CO₂, emballage, origine, effet sur les écosystèmes';

/**
 * Compact labels shown under each score in the on-tile badge. Kept short so the
 * unified badge stays small; the tooltip spells out the full score names.
 */
export const SCORE_KIND_SHORT = {
  nutri: 'Nutri',
  green: 'Green',
  nova: 'Nova',
} as const;

/** Traffic-light colors for nutrient levels (fat / saturated fat / sugars / salt). */
export const NUTRIENT_LEVEL_COLOR: Record<Level, string> = {
  low: '#008240',
  moderate: '#EE8100',
  high: '#E63312',
};

// User-facing (FR) — the extension UI is French by design.
export const NUTRIENT_LEVEL_LABEL: Record<Level, string> = {
  low: 'Faible',
  moderate: 'Modéré',
  high: 'Élevé',
};

export function contrastTextColor(bg: string): '#FFFFFF' | '#1A1A1A' {
  // Rough luminance on a hex #rrggbb. Light backgrounds (yellow for C, amber for D)
  // get dark text; dark green/red get white. Simple, good-enough for score badges.
  const hex = bg.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1A1A1A' : '#FFFFFF';
}
