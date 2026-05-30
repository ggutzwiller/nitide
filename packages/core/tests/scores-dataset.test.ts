import { describe, expect, it } from 'vitest';
import {
  packScoreByte,
  parseScoresDataset,
  serializeScoresDataset,
  unpackScoreByte,
  type ScoreRecord,
} from '../src/scores-dataset.ts';
import type { GreenScore, NovaGroup, NutriScore } from '../src/types.ts';

const NUTRI: (NutriScore | null)[] = [null, 'a', 'b', 'c', 'd', 'e'];
const GREEN: (GreenScore | null)[] = [null, 'a', 'b', 'c', 'd', 'e'];
const NOVA: (NovaGroup | null)[] = [null, 1, 2, 3, 4];

describe('score byte codec', () => {
  it('round-trips every valid combination into a single byte', () => {
    for (const nutriScore of NUTRI) {
      for (const greenScore of GREEN) {
        for (const nova of NOVA) {
          const byte = packScoreByte({ nutriScore, greenScore, nova });
          expect(byte).toBeGreaterThanOrEqual(0);
          expect(byte).toBeLessThan(256);
          expect(unpackScoreByte(byte)).toEqual({ nutriScore, greenScore, nova });
        }
      }
    }
  });
});

const SAMPLE: ScoreRecord[] = [
  { ean: '3560070546879', nutriScore: 'a', greenScore: 'b', nova: 1 },
  { ean: '8076809523509', nutriScore: 'e', greenScore: null, nova: 4 },
  { ean: '0000101209159', nutriScore: 'e', greenScore: 'd', nova: null },
];

const clone = (records: ScoreRecord[]): ScoreRecord[] => records.map((r) => ({ ...r }));

describe('serialize/parse round-trip', () => {
  it('parses back what it serialized and looks up by EAN', () => {
    const ds = parseScoresDataset(serializeScoresDataset(clone(SAMPLE)));
    expect(ds.count).toBe(3);
    expect(ds.lookup('3560070546879')).toEqual({ nutriScore: 'a', greenScore: 'b', nova: 1 });
    expect(ds.lookup('8076809523509')).toEqual({ nutriScore: 'e', greenScore: null, nova: 4 });
    expect(ds.lookup('0000101209159')).toEqual({ nutriScore: 'e', greenScore: 'd', nova: null });
  });

  it('returns null for misses, non-numeric EAN, and empty input', () => {
    const ds = parseScoresDataset(serializeScoresDataset(clone(SAMPLE)));
    expect(ds.lookup('9999999999999')).toBeNull();
    expect(ds.lookup('not-an-ean')).toBeNull();
    expect(ds.lookup('')).toBeNull();
  });

  it('sorts unsorted input so binary search still works', () => {
    const reversed = clone(SAMPLE).reverse();
    const ds = parseScoresDataset(serializeScoresDataset(reversed));
    expect(ds.lookup('3560070546879')).toEqual({ nutriScore: 'a', greenScore: 'b', nova: 1 });
    expect(ds.lookup('8076809523509')).toEqual({ nutriScore: 'e', greenScore: null, nova: 4 });
  });

  it('drops records whose EAN is not 8-14 digits', () => {
    const ds = parseScoresDataset(
      serializeScoresDataset([
        { ean: 'abc', nutriScore: 'a', greenScore: null, nova: null },
        { ean: '12345', nutriScore: 'a', greenScore: null, nova: null }, // too short
        { ean: '3560070546879', nutriScore: 'c', greenScore: null, nova: null },
      ]),
    );
    expect(ds.count).toBe(1);
    expect(ds.lookup('3560070546879')).toEqual({ nutriScore: 'c', greenScore: null, nova: null });
  });

  it('rejects a buffer with a bad magic', () => {
    expect(() => parseScoresDataset(new ArrayBuffer(16))).toThrow();
  });

  it('handles an empty dataset', () => {
    const ds = parseScoresDataset(serializeScoresDataset([]));
    expect(ds.count).toBe(0);
    expect(ds.lookup('3560070546879')).toBeNull();
  });
});
