# Scripts

Repo-level scripts run with [`tsx`](https://github.com/privatenumber/tsx) / DuckDB.

## `dataset:build` — régénérer le dataset de scores bundlé

L'extension embarque un dataset slim `EAN → {nutri, green, nova}` (périmètre France)
pour afficher les badges **sans appeler l'API OFF en rafale** (cf.
[spec](../docs/superpowers/specs/2026-05-30-scores-dataset-design.md)). Le dump source
fait ~72 Go : il n'est pas dans le repo et n'est jamais en CI, donc la régénération est
une **étape locale manuelle**.

### Prérequis

- [DuckDB](https://duckdb.org) CLI dans le `PATH` (`brew install duckdb`).
- Le dump OFF NDJSON à la **racine du repo**, nommé `openfoodfacts-products.jsonl` :
  ```bash
  curl -L https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz \
    | gzip -dc > openfoodfacts-products.jsonl
  ```
  (Gitignoré. ~11 Go compressé → ~72 Go décompressé.)

### Lancer

```bash
pnpm dataset:build
```

Deux étapes :

1. `scripts/build-scores-fr.sql` (DuckDB) — extrait les produits FR avec ≥1 score,
   triés par EAN numérique → `scripts/off-scores-fr.csv` (gitignoré).
2. `scripts/build-scores-dataset.ts` — packe le CSV au format binaire `NSD1`, gzip,
   et écrit les **artefacts commités** :
   - `apps/extension/public/data/scores-fr.bin.gz` (~2 Mo)
   - `apps/extension/public/data/scores-fr.meta.json`

Un **garde-fou** stoppe le build si le nombre de produits chute de >20 % vs le build
précédent (protège contre un dump tronqué).

### Après

Commiter `apps/extension/public/data/scores-fr.bin.gz` et `scores-fr.meta.json`.

## `off-subset.sql` — exploration / mesures

Outil d'analyse DuckDB du dump (comptages monde/FR, tailles). Pas dans le chemin de build.

## `icons:generate`

Régénère les PNG de l'extension + le favicon de la landing depuis le SVG source.
