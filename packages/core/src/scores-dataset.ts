// Compact, bundle-friendly representation of `EAN → {nutri, green, nova}`.
//
// The whole dataset is one ArrayBuffer:
//
//   offset 0      magic    uint32 LE  "NSD1"
//   offset 4      count    uint32 LE  N
//   offset 8      eans     Float64[N] LE  EAN as Number, sorted ascending
//   offset 8+8N   scores   Uint8[N]       packed score byte, index-aligned with eans
//
// EANs fit in a JS Number (max EAN-13 ≈ 1e13 < 2^53). Sorting enables binary
// search at lookup time. The serializer and the reader share `packScoreByte` /
// `unpackScoreByte`, so the on-disk format can never drift between writer and
// reader — the round-trip test in this package pins that contract.
import type { GreenScore, NovaGroup, NutriScore } from './types.ts';

export interface ScoreTriple {
  nutriScore: NutriScore | null;
  greenScore: GreenScore | null;
  nova: NovaGroup | null;
}

export interface ScoreRecord extends ScoreTriple {
  ean: string;
}

export interface ScoresDataset {
  readonly count: number;
  lookup(ean: string): ScoreTriple | null;
}

const GRADES = ['a', 'b', 'c', 'd', 'e'] as const;
const EAN_PATTERN = /^\d{8,14}$/;
const MAGIC = 0x3144_534e; // bytes N,S,D,1 read little-endian
const HEADER_BYTES = 8;

// nutri,green ∈ {0=absent, 1=a … 5=e}; nova ∈ {0=absent, 1 … 4}.
// Mixed-radix into one byte: max = (5*6 + 5)*5 + 4 = 179 < 256.
export function packScoreByte(triple: ScoreTriple): number {
  const nutri = triple.nutriScore ? GRADES.indexOf(triple.nutriScore) + 1 : 0;
  const green = triple.greenScore ? GRADES.indexOf(triple.greenScore) + 1 : 0;
  const nova = triple.nova ?? 0;
  return (nutri * 6 + green) * 5 + nova;
}

export function unpackScoreByte(byte: number): ScoreTriple {
  const nova = byte % 5;
  const green = Math.floor(byte / 5) % 6;
  const nutri = Math.floor(byte / 30);
  return {
    nutriScore: nutri ? GRADES[nutri - 1]! : null,
    greenScore: green ? GRADES[green - 1]! : null,
    nova: nova ? (nova as NovaGroup) : null,
  };
}

export function serializeScoresDataset(records: ScoreRecord[]): ArrayBuffer {
  // Duplicate EANs are left as-is: they sort adjacent and lookup returns one
  // valid triple either way, so deduping would add cost for no behaviour change.
  const rows = records
    .filter((r) => EAN_PATTERN.test(r.ean))
    .map((r) => ({ key: Number(r.ean), byte: packScoreByte(r) }))
    .sort((a, b) => a.key - b.key);

  const count = rows.length;
  const buffer = new ArrayBuffer(HEADER_BYTES + count * 8 + count);
  const header = new DataView(buffer);
  header.setUint32(0, MAGIC, true);
  header.setUint32(4, count, true);

  // Two parallel arrays sharing the same index: eanIndex[i] ↔ scoreBytes[i].
  const eanIndex = new Float64Array(buffer, HEADER_BYTES, count);
  const scoreBytes = new Uint8Array(buffer, HEADER_BYTES + count * 8, count);
  for (let i = 0; i < count; i++) {
    eanIndex[i] = rows[i]!.key;
    scoreBytes[i] = rows[i]!.byte;
  }
  return buffer;
}

export function parseScoresDataset(buffer: ArrayBuffer): ScoresDataset {
  const header = new DataView(buffer);
  if (buffer.byteLength < HEADER_BYTES || header.getUint32(0, true) !== MAGIC) {
    throw new Error('Invalid scores dataset: bad magic number');
  }
  const count = header.getUint32(4, true);

  // Two parallel arrays sharing the same index: eanIndex[i] ↔ scoreBytes[i].
  const eanIndex = new Float64Array(buffer, HEADER_BYTES, count);
  const scoreBytes = new Uint8Array(buffer, HEADER_BYTES + count * 8, count);

  return {
    count,
    lookup(ean: string): ScoreTriple | null {
      if (!EAN_PATTERN.test(ean)) return null;
      const position = binarySearch(eanIndex, Number(ean));
      return position === -1 ? null : unpackScoreByte(scoreBytes[position]!);
    },
  };
}

/** Index of `key` in the ascending-sorted array, or -1 if absent. */
function binarySearch(sorted: Float64Array, key: number): number {
  let low = 0;
  let high = sorted.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const value = sorted[mid]!;
    if (value === key) return mid;
    if (value < key) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}
