import { describe, expect, it } from 'vitest';
import { NUTRIENT_LEVEL_COLOR, NUTRIENT_LEVEL_LABEL } from '../src/shared/off-colors.ts';

describe('nutrient level palette', () => {
  it('maps each level to a color and a French label', () => {
    expect(NUTRIENT_LEVEL_COLOR.low).toMatch(/^#/);
    expect(NUTRIENT_LEVEL_LABEL).toEqual({ low: 'Faible', moderate: 'Modéré', high: 'Élevé' });
  });
});
