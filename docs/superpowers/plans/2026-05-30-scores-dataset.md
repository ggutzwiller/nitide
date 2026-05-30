# Scores Dataset (pivot data-source M3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir les scores Nutri/Green/Nova depuis un dataset FR bundlé (lookup local instantané) au lieu d'appeler l'API OFF en rafale — supprimant la cause racine des 429.

**Architecture:** `packages/core` gagne un codec binaire pur (sérialisation ↔ lecture + recherche binaire). Le build script réutilise la sérialisation du core pour produire `scores-fr.bin.gz` (commité). Le service worker charge ce fichier et répond _dataset-first_ ; l'API OFF ne sert que de filet sur `mode:'remote-ok'`.

**Tech Stack:** TypeScript strict, Vitest, pnpm workspaces, DuckDB (build-time), `@crxjs/vite-plugin`, Preact (inchangé ici).

**Spec :** `docs/superpowers/specs/2026-05-30-scores-dataset-design.md`

**Note de commit :** l'utilisateur revoit avant chaque commit. Les étapes "Commit" ci-dessous sont à exécuter **seulement après son feu vert** — sinon, laisser staged/working et présenter pour revue.

---

## Structure de fichiers

**Créés :**

- `packages/core/src/scores-dataset.ts` — codec pur : `packScoreByte`/`unpackScoreByte`, `serializeScoresDataset`, `parseScoresDataset` (+ `lookup`).
- `packages/core/tests/scores-dataset.test.ts` — tests du codec + lookup.
- `apps/extension/src/background/dataset.ts` — chargement lazy/mémoïsé du `.bin.gz` dans le worker.
- `apps/extension/tests/dataset.test.ts` — test du loader (fetch/decompress mockés).
- `scripts/build-scores-dataset.ts` — CSV → records → `serializeScoresDataset` → gzip → fichiers + meta + garde-fou.
- `scripts/README.md` — procédure de régénération.
- `apps/extension/public/data/scores-fr.bin.gz` — artefact commité (~2 Mo).
- `apps/extension/public/data/scores-fr.meta.json` — artefact commité.

**Modifiés :**

- `packages/core/src/index.ts` — exports.
- `apps/extension/src/shared/messages.ts` — champ `mode`.
- `apps/extension/src/background/matcher.ts` — logique dataset-first + modes.
- `apps/extension/src/background/index.ts` — injecte le dataset dans le matcher.
- `apps/extension/src/content/carrefour/index.ts` — envoie `mode:'local'`.
- `apps/extension/tests/matcher.test.ts` — cas dataset-first.
- `scripts/off-subset.sql` — `ORDER BY` EAN numérique, FR only, filtre EAN.
- `package.json` — script `dataset:build`.
- `PROJECT.md` / `CLAUDE.md` — note d'archi.

---

## Task 1 : Codec d'octet de score (pur)

**Files:**

- Create: `packages/core/src/scores-dataset.ts`
- Test: `packages/core/tests/scores-dataset.test.ts`

- [ ] **Step 1 — Test d'échec (round-trip sur les 180 combinaisons)**

```ts
import { describe, expect, it } from 'vitest';
import { packScoreByte, unpackScoreByte } from '../src/scores-dataset.ts';
import type { GreenScore, NovaGroup, NutriScore } from '../src/types.ts';

const NUTRI: (NutriScore | null)[] = [null, 'a', 'b', 'c', 'd', 'e'];
const GREEN: (GreenScore | null)[] = [null, 'a', 'b', 'c', 'd', 'e'];
const NOVA: (NovaGroup | null)[] = [null, 1, 2, 3, 4];

describe('score byte codec', () => {
  it('round-trips every valid combination', () => {
    for (const nutriScore of NUTRI)
      for (const greenScore of GREEN)
        for (const nova of NOVA) {
          const byte = packScoreByte({ nutriScore, greenScore, nova });
          expect(byte).toBeGreaterThanOrEqual(0);
          expect(byte).toBeLessThan(256);
          expect(unpackScoreByte(byte)).toEqual({ nutriScore, greenScore, nova });
        }
  });
});
```

- [ ] **Step 2 — Vérifier l'échec** : `pnpm --filter @nitide/core test -- scores-dataset` → FAIL (module introuvable).

- [ ] **Step 3 — Implémentation minimale**

```ts
import type { GreenScore, NovaGroup, NutriScore } from './types.ts';

export interface ScoreTriple {
  nutriScore: NutriScore | null;
  greenScore: GreenScore | null;
  nova: NovaGroup | null;
}

const GRADES = ['a', 'b', 'c', 'd', 'e'] as const;

// nutri,green ∈ {0=absent,1=a…5=e} ; nova ∈ {0=absent,1…4}. Max = 5*30+5*5+4 = 179.
export function packScoreByte(t: ScoreTriple): number {
  const nutri = t.nutriScore ? GRADES.indexOf(t.nutriScore) + 1 : 0;
  const green = t.greenScore ? GRADES.indexOf(t.greenScore) + 1 : 0;
  const nova = t.nova ?? 0;
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
```

- [ ] **Step 4 — Vérifier le succès** : même commande → PASS.

- [ ] **Step 5 — Commit** (après feu vert) : `feat(core): score byte codec`.

---

## Task 2 : Sérialisation + lecture + lookup

**Files:**

- Modify: `packages/core/src/scores-dataset.ts`
- Test: `packages/core/tests/scores-dataset.test.ts`

- [ ] **Step 1 — Tests d'échec**

```ts
import { parseScoresDataset, serializeScoresDataset } from '../src/scores-dataset.ts';

const SAMPLE = [
  { ean: '3560070546879', nutriScore: 'a', greenScore: 'b', nova: 1 },
  { ean: '8076809523509', nutriScore: 'e', greenScore: null, nova: 4 },
  { ean: '0000101209159', nutriScore: 'e', greenScore: 'd', nova: null },
] as const;

describe('serialize/parse round-trip', () => {
  it('parses back what it serialized and looks up by EAN', () => {
    const buf = serializeScoresDataset(SAMPLE.map((r) => ({ ...r })));
    const ds = parseScoresDataset(buf);
    expect(ds.count).toBe(3);
    expect(ds.lookup('3560070546879')).toEqual({ nutriScore: 'a', greenScore: 'b', nova: 1 });
    expect(ds.lookup('8076809523509')).toEqual({ nutriScore: 'e', greenScore: null, nova: 4 });
    expect(ds.lookup('0000101209159')).toEqual({ nutriScore: 'e', greenScore: 'd', nova: null });
  });

  it('returns null for misses, non-numeric EAN, and out-of-range', () => {
    const ds = parseScoresDataset(serializeScoresDataset(SAMPLE.map((r) => ({ ...r }))));
    expect(ds.lookup('9999999999999')).toBeNull();
    expect(ds.lookup('not-an-ean')).toBeNull();
    expect(ds.lookup('')).toBeNull();
  });

  it('sorts unsorted input so binary search works', () => {
    const reversed = [...SAMPLE].reverse().map((r) => ({ ...r }));
    const ds = parseScoresDataset(serializeScoresDataset(reversed));
    expect(ds.lookup('3560070546879')).toEqual({ nutriScore: 'a', greenScore: 'b', nova: 1 });
  });

  it('rejects a buffer with a bad magic', () => {
    const bad = new ArrayBuffer(16);
    expect(() => parseScoresDataset(bad)).toThrow();
  });
});
```

- [ ] **Step 2 — Vérifier l'échec** : `pnpm --filter @nitide/core test -- scores-dataset` → FAIL.

- [ ] **Step 3 — Implémentation**

```ts
export interface ScoreRecord extends ScoreTriple {
  ean: string;
}

export interface ScoresDataset {
  readonly count: number;
  lookup(ean: string): ScoreTriple | null;
}

const MAGIC = 0x3144534e; // "NSD1" en little-endian (N,S,D,1)
const HEADER_BYTES = 8;

export function serializeScoresDataset(records: ScoreRecord[]): ArrayBuffer {
  const valid = records
    .filter((r) => /^\d{8,14}$/.test(r.ean))
    .map((r) => ({ key: Number(r.ean), byte: packScoreByte(r) }))
    .sort((a, b) => a.key - b.key);
  const n = valid.length;
  const buf = new ArrayBuffer(HEADER_BYTES + n * 8 + n);
  const view = new DataView(buf);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, n, true);
  const eans = new Float64Array(buf, HEADER_BYTES, n);
  const scores = new Uint8Array(buf, HEADER_BYTES + n * 8, n);
  for (let i = 0; i < n; i++) {
    eans[i] = valid[i]!.key;
    scores[i] = valid[i]!.byte;
  }
  return buf;
}

export function parseScoresDataset(buffer: ArrayBuffer): ScoresDataset {
  const view = new DataView(buffer);
  if (buffer.byteLength < HEADER_BYTES || view.getUint32(0, true) !== MAGIC) {
    throw new Error('Invalid scores dataset: bad magic');
  }
  const count = view.getUint32(4, true);
  const eans = new Float64Array(buffer, HEADER_BYTES, count);
  const scores = new Uint8Array(buffer, HEADER_BYTES + count * 8, count);

  return {
    count,
    lookup(ean: string): ScoreTriple | null {
      if (!/^\d{8,14}$/.test(ean)) return null;
      const key = Number(ean);
      let lo = 0;
      let hi = count - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const v = eans[mid]!;
        if (v === key) return unpackScoreByte(scores[mid]!);
        if (v < key) lo = mid + 1;
        else hi = mid - 1;
      }
      return null;
    },
  };
}
```

- [ ] **Step 4 — Vérifier le succès** : même commande → PASS (tous les tests scores-dataset verts).

- [ ] **Step 5 — Commit** (après feu vert) : `feat(core): binary scores dataset (serialize/parse/lookup)`.

---

## Task 3 : Exports du core

**Files:** Modify `packages/core/src/index.ts`

- [ ] **Step 1 — Ajouter les exports**

```ts
export {
  packScoreByte,
  unpackScoreByte,
  serializeScoresDataset,
  parseScoresDataset,
} from './scores-dataset.ts';
export type { ScoreTriple, ScoreRecord, ScoresDataset } from './scores-dataset.ts';
```

- [ ] **Step 2 — Vérifier** : `pnpm --filter @nitide/core typecheck` → OK ; `pnpm --filter @nitide/core test` → tous verts.

- [ ] **Step 3 — Commit** (après feu vert) : `feat(core): export scores dataset API`.

---

## Task 4 : Champ `mode` dans les messages

**Files:** Modify `apps/extension/src/shared/messages.ts`

- [ ] **Step 1 — Lire le fichier existant** pour respecter le style (`MATCH_CHANNEL`, `MatchRequest`, `isMatchRequest`).

- [ ] **Step 2 — Ajouter le mode**

```ts
export type MatchMode = 'local' | 'remote-ok';
// Dans MatchRequest : ajouter `mode?: MatchMode;` (défaut 'local' côté worker).
```

Mettre à jour `isMatchRequest` pour tolérer l'absence du champ (rétro-compat) et, si présent, vérifier `'local' | 'remote-ok'`.

- [ ] **Step 3 — Vérifier** : `pnpm --filter nitide-extension typecheck` → OK.

- [ ] **Step 4 — Commit** (après feu vert) : `feat(ext): add match mode to messages`.

---

## Task 5 : Loader de dataset dans le worker

**Files:**

- Create: `apps/extension/src/background/dataset.ts`
- Test: `apps/extension/tests/dataset.test.ts`

- [ ] **Step 1 — Test (fetch + DecompressionStream mockés)**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { serializeScoresDataset } from '@nitide/core';

afterEach(() => vi.unstubAllGlobals());

describe('loadBundledDataset', () => {
  it('returns null and does not throw when the asset is missing', async () => {
    vi.stubGlobal('chrome', { runtime: { getURL: (p: string) => p } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { loadBundledDataset } = await import('../src/background/dataset.ts');
    expect(await loadBundledDataset()).toBeNull();
  });
});
```

> Note : tester le chemin nominal (gzip réel) est fragile en jsdom ; on couvre le contrat de parsing dans `@nitide/core` (Task 2) et ici le chemin de dégradation. Le chemin nominal sera validé manuellement à l'install de l'extension.

- [ ] **Step 2 — Vérifier l'échec** : `pnpm --filter nitide-extension test -- dataset` → FAIL.

- [ ] **Step 3 — Implémentation**

```ts
import { parseScoresDataset, type ScoresDataset } from '@nitide/core';

const ASSET_PATH = 'data/scores-fr.bin.gz';
let cached: Promise<ScoresDataset | null> | undefined;

export function loadBundledDataset(): Promise<ScoresDataset | null> {
  if (!cached) cached = load();
  return cached;
}

async function load(): Promise<ScoresDataset | null> {
  try {
    const res = await fetch(chrome.runtime.getURL(ASSET_PATH));
    if (!res.ok || !res.body) {
      console.warn(`[Nitide] dataset asset unavailable (HTTP ${res.status})`);
      return null;
    }
    const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    const ds = parseScoresDataset(buf);
    console.info(`[Nitide] dataset chargé: ${ds.count} produits`);
    return ds;
  } catch (err) {
    console.warn('[Nitide] échec de chargement du dataset', err);
    return null;
  }
}
```

- [ ] **Step 4 — Vérifier le succès** : même commande → PASS.

- [ ] **Step 5 — Commit** (après feu vert) : `feat(ext): bundled dataset loader`.

---

## Task 6 : Matcher dataset-first + modes

**Files:**

- Modify: `apps/extension/src/background/matcher.ts`
- Test: `apps/extension/tests/matcher.test.ts`

- [ ] **Step 1 — Lire `matcher.test.ts` et `matcher.ts` existants** pour réutiliser les helpers de mock (`OffClient`, etc.) et ne pas casser les 8 tests actuels.

- [ ] **Step 2 — Tests d'échec (nouveaux cas)**

```ts
// Helper: dataset en mémoire à partir de records.
import { serializeScoresDataset, parseScoresDataset } from '@nitide/core';
const ds = parseScoresDataset(
  serializeScoresDataset([{ ean: '3560070546879', nutriScore: 'a', greenScore: 'b', nova: 1 }]),
);

it('mode local + hit dataset → Product sans appeler le client', async () => {
  const client = { fetchByBarcode: vi.fn(), searchByText: vi.fn() };
  const matcher = createMatcher({ client, dataset: ds });
  const p = await matcher.match({ ean: '3560070546879', name: 'Pâtes' }, 'local');
  expect(p?.nutriScore).toBe('a');
  expect(client.fetchByBarcode).not.toHaveBeenCalled();
});

it('mode local + miss → null sans appeler le client', async () => {
  const client = { fetchByBarcode: vi.fn(), searchByText: vi.fn() };
  const matcher = createMatcher({ client, dataset: ds });
  expect(await matcher.match({ ean: '0000000000000', name: 'X' }, 'local')).toBeNull();
  expect(client.fetchByBarcode).not.toHaveBeenCalled();
});

it('mode remote-ok + miss → fallback client', async () => {
  const client = {
    fetchByBarcode: vi.fn().mockResolvedValue({
      ean: '0000000000000',
      name: 'X',
      nutriScore: 'c',
      greenScore: null,
      nova: null,
      offUrl: '',
    }),
    searchByText: vi.fn(),
  };
  const matcher = createMatcher({ client, dataset: ds });
  const p = await matcher.match({ ean: '0000000000000', name: 'X' }, 'remote-ok');
  expect(p?.nutriScore).toBe('c');
  expect(client.fetchByBarcode).toHaveBeenCalledOnce();
});
```

- [ ] **Step 3 — Vérifier l'échec** : `pnpm --filter nitide-extension test -- matcher` → FAIL.

- [ ] **Step 4 — Implémentation** : ajouter `dataset?: ScoresDataset` à `MatcherDeps` ; `match(input, mode: MatchMode = 'local')` :
  1. si `input.ean` et `dataset`, `lookup` ; hit → construire un `Product` `{ ean, name: input.name, brand: input.brand ?? null, ...triple, offUrl: `${OFF_BASE_URL}/product/${ean}` }` et le renvoyer ;
  2. miss + `local` → `null` ;
  3. sinon (remote-ok) → boucle de retry/throttle existante (inchangée).
     Importer `OFF_BASE_URL` depuis `@nitide/core`.

- [ ] **Step 5 — Vérifier le succès** : `pnpm --filter nitide-extension test -- matcher` → PASS (anciens + nouveaux).

- [ ] **Step 6 — Commit** (après feu vert) : `feat(ext): dataset-first matcher with local/remote-ok modes`.

---

## Task 7 : Câblage worker + content script

**Files:**

- Modify: `apps/extension/src/background/index.ts`
- Modify: `apps/extension/src/content/carrefour/index.ts`

- [ ] **Step 1 — Worker** : `index.ts` charge le dataset et l'injecte.

```ts
import { loadBundledDataset } from './dataset.ts';
// au démarrage :
const datasetPromise = loadBundledDataset();
// dans le handler onMessage, avant match :
const dataset = await datasetPromise;
const matcher = createMatcher({
  storage: createChromeLocalStorage(),
  dataset: dataset ?? undefined,
});
const product = await matcher.match(message.input, message.mode ?? 'local');
```

(Adapter pour ne créer le matcher qu'une fois ; cf. structure existante.)

- [ ] **Step 2 — Content script** : `resolve()` envoie `mode: 'local'` dans le `MatchRequest`.

- [ ] **Step 3 — Vérifier** : `pnpm --filter nitide-extension typecheck` → OK ; `pnpm --filter nitide-extension test` → tous verts.

- [ ] **Step 4 — Commit** (après feu vert) : `feat(ext): wire dataset into worker, list scan uses local mode`.

---

## Task 8 : Pipeline de génération

**Files:**

- Modify: `scripts/off-subset.sql`
- Create: `scripts/build-scores-dataset.ts`, `scripts/README.md`
- Modify: `package.json`

- [ ] **Step 1 — `off-subset.sql`** : produire un unique CSV FR trié. Remplacer les deux COPY par un seul :

```sql
COPY (
  SELECT code, coalesce(nutri,'') n, coalesce(green,'') g, coalesce(nova::VARCHAR,'') v
  FROM p
  WHERE code SIMILAR TO '\d{8,14}' AND is_fr
    AND (nutri IS NOT NULL OR green IS NOT NULL OR nova IS NOT NULL)
  ORDER BY CAST(code AS HUGEINT)
) TO 'scripts/off-scores-fr.csv' (HEADER false);
```

- [ ] **Step 2 — `build-scores-dataset.ts`** : lit `scripts/off-scores-fr.csv`, mappe chaque ligne en `ScoreRecord` (`n`→nutriScore, `g`→greenScore, `v`→nova number|null, '' → null), appelle `serializeScoresDataset`, gzip via `node:zlib gzipSync`, écrit `apps/extension/public/data/scores-fr.bin.gz`. Écrit `scores-fr.meta.json` `{ formatVersion:1, count, generatedAt:new Date().toISOString(), sourceCount }`. Garde-fou : lire l'ancien meta s'il existe ; si `count < 0.8 * oldCount` → `throw`.

- [ ] **Step 3 — `package.json`** : ajouter `"dataset:build": "duckdb < scripts/off-subset.sql && tsx scripts/build-scores-dataset.ts"`.

- [ ] **Step 4 — `scripts/README.md`** : documenter la procédure (télécharger le dump OFF jsonl à la racine, `pnpm dataset:build`, commiter `apps/extension/public/data/*`).

- [ ] **Step 5 — Vérifier** : `pnpm typecheck` (le script tsx ne casse pas le typecheck du repo).

- [ ] **Step 6 — Commit** (après feu vert) : `feat(scripts): scores dataset build pipeline`.

---

## Task 9 : Générer l'artefact réel + vérification globale

**Files:** `apps/extension/public/data/scores-fr.bin.gz`, `scores-fr.meta.json`

- [ ] **Step 1 — Générer** : `pnpm dataset:build` (le dump 72 Go est présent en local). Vérifier la taille (~2 Mo) et le `count` (~594k) dans le meta.

- [ ] **Step 2 — Sanity check** : un mini-script/REPL qui charge le `.bin.gz`, le décompresse, `parseScoresDataset`, et vérifie `lookup('3560070546879')` renvoie bien un triple cohérent avec le CSV.

- [ ] **Step 3 — Vérification globale** : `pnpm test && pnpm typecheck && pnpm lint && pnpm build` → tout vert. L'asset doit apparaître dans `dist/data/`.

- [ ] **Step 4 — Note d'archi** : ajouter une ligne dans `PROJECT.md` (§ source de données) et `CLAUDE.md` (le 429 est réglé par le dataset bundlé, API en fallback).

- [ ] **Step 5 — Commit** (après feu vert) : `feat(ext): bundle FR scores dataset + docs`.

---

## Self-review (à faire après rédaction — voir ci-dessous)

Couverture spec ↔ tâches :

- §4 pipeline → Task 8/9 ✓
- §5 format binaire → Task 1/2 ✓
- §6A lecteur core → Task 2/3 ✓
- §6B loader worker → Task 5 ✓
- §6C matcher modes → Task 4/6/7 ✓
- §6D content script → Task 7 ✓
- §7 erreurs → Task 5 (loader null), Task 2 (bad magic), Task 8 (garde-fou) ✓
- §8 tests → Task 1/2/5/6 ✓

Cohérence de types : `ScoreTriple`/`ScoreRecord`/`ScoresDataset`, `MatchMode`, `serializeScoresDataset`/`parseScoresDataset`, `createMatcher({dataset})`, `match(input, mode)` — noms identiques d'une tâche à l'autre. ✓
