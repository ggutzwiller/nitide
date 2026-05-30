// Build step 2/2 — pack scripts/off-scores-fr.csv into the binary the extension
// bundles. Reuses `serializeScoresDataset` from @nitide/core, so the on-disk
// format is identical to what the runtime reader expects (the round-trip test
// in packages/core pins that contract).
//
// Run via `pnpm dataset:build` (which runs build-scores-fr.sql first).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
// Import the leaf module directly (not the package entry): it has no side
// effects and no `chrome` dependency, and avoids resolving the workspace
// package name from a repo-root script run under tsx.
import { serializeScoresDataset, type ScoreRecord } from '../packages/core/src/scores-dataset.ts';
import type { GreenScore, NovaGroup, NutriScore } from '../packages/core/src/types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSV = resolve(ROOT, 'scripts/off-scores-fr.csv');
const OUT_DIR = resolve(ROOT, 'apps/extension/public/data');
const OUT_BIN = resolve(OUT_DIR, 'scores-fr.bin.gz');
const OUT_META = resolve(OUT_DIR, 'scores-fr.meta.json');

if (!existsSync(CSV)) {
  throw new Error(`CSV not found: ${CSV}. Run build-scores-fr.sql first (pnpm dataset:build).`);
}

const records: ScoreRecord[] = [];
for (const line of readFileSync(CSV, 'utf8').split('\n')) {
  if (!line) continue;
  const [code, n, g, v] = line.split(',');
  records.push({
    ean: code ?? '',
    nutriScore: (n || null) as NutriScore | null,
    greenScore: (g || null) as GreenScore | null,
    nova: v ? (Number(v) as NovaGroup) : null,
  });
}

const buffer = serializeScoresDataset(records);
const count = new DataView(buffer).getUint32(4, true); // exact, post EAN-filtering

// Guard-rail: a >20 % drop vs the previous build usually means a truncated or
// corrupt dump. Refuse to overwrite a good dataset with a broken one.
if (existsSync(OUT_META)) {
  const prev = JSON.parse(readFileSync(OUT_META, 'utf8')) as { count?: number };
  if (typeof prev.count === 'number' && count < prev.count * 0.8) {
    throw new Error(
      `Refusing to write: ${count} products is < 80% of the previous build (${prev.count}). Truncated dump?`,
    );
  }
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_BIN, gzipSync(Buffer.from(buffer), { level: 9 }));
writeFileSync(
  OUT_META,
  JSON.stringify(
    {
      formatVersion: 1,
      count,
      sourceRows: records.length,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + '\n',
);

console.info(`[Nitide] dataset written: ${count} products → ${OUT_BIN}`);
