# Design — Dataset de scores bundlé (pivot data-source M3)

> Date : 2026-05-30 · Statut : approuvé · Milestone : M3
> Charte de référence : [PROJECT.md](../../../PROJECT.md) · Notes : [CLAUDE.md](../../../CLAUDE.md)

> **Note d'implémentation (post-revue).** À la revue de code, le périmètre a été **simplifié en dataset-only** : le mode `remote-ok` et tout le code d'appel à l'API OFF (client, cache, throttle, retry, recherche texte) ont été **supprimés** plutôt que gardés dormants. Le matcher fait uniquement un lookup local ; un produit absent du dataset n'a pas de badge. Un éventuel lookup live (survol/fiche) sera reconstruit de zéro avec son déclencheur. Les sections ci-dessous décrivent le design approuvé d'origine ; le `mode`/`remote-ok` et les composants API qu'elles mentionnent ne sont donc pas dans le code final.

## 1. Contexte & problème

Pendant l'investigation de M3, deux problèmes indépendants ont été identifiés :

- **A — 429 sur l'API Open Food Facts.** L'extension appelait `/api/v2/product/{ean}` en rafale (une page de liste Carrefour = 37 tuiles = 37 appels quasi simultanés). Mesure sur l'API réelle : **429 dès ~9-10 requêtes rapides**, récupération en ~5 s, débit soutenu sûr ≈ 1 req/s. La rafale en page de liste est donc structurellement incompatible avec le budget OFF.
- **B — Parsing du DOM Carrefour.** Indépendant, **hors scope de ce spec** (investigation séparée). Le parser fonctionne sur les fixtures ; sa validité sur le site live reste à vérifier.

Ce spec traite **uniquement le problème A** via un pivot de la source de données.

### Données de cadrage (mesurées)

Dump OFF NDJSON (72 Go décompressé / 11 Go gzippé), exploré localement avec DuckDB (`scripts/off-subset.sql`, scan complet en ~27 s) :

| Métrique                         | Valeur      |
| -------------------------------- | ----------- |
| Produits totaux                  | 4 514 002   |
| EAN valides (`\d{8,14}`)         | 4 443 356   |
| Avec ≥1 score                    | 1 775 946   |
| **Avec ≥1 score, tagués France** | **593 805** |
| Ont un Nutri-Score               | 1 361 774   |
| Ont un Green-Score               | 840 462     |
| Ont un Nova                      | 1 123 667   |

Taille de l'extrait FR `code,nutri,green,nova` : 12 Mo CSV brut → **3,66 Mo gzippé** ; en binaire packé visé ~5,3 Mo brut → **~2 Mo gzippé**.

## 2. Décisions

| Décision                   | Choix                                                                                        | Raison                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Source de données          | Dataset slim `EAN → {nutri, green, nova}` **bundlé** dans l'extension                        | Supprime la rafale réseau → plus de 429. Instantané, hors-ligne.                                            |
| Périmètre géographique     | **France** (~594 k produits)                                                                 | Carrefour.fr est FR ; le monde (1,78 M / ~11 Mo) serait surdimensionné.                                     |
| Rôle de l'API OFF          | **Fallback throttlé uniquement**, sur déclencheur explicite (survol/fiche), jamais en rafale | Filet pour les produits absents du dataset + détails (M4). Un appel à la fois.                              |
| Stockage du dataset généré | **Commit dans le repo** (git normal)                                                         | Le dump 72 Go n'est pas en CI ; régénération = étape locale manuelle. ~2 Mo dans git, refresh peu fréquent. |
| Format / lookup            | **Tableaux typés triés + recherche binaire** (octet de score packé)                          | Mémoire minimale, chargement zéro-copie, zéro dépendance, adapté au service worker MV3 éphémère.            |

## 3. Architecture

Deux mondes séparés : **build-time (hors-ligne)** et **runtime (navigateur)**.

```
BUILD-TIME (manuel, occasionnel)                RUNTIME (extension)
─────────────────────────────                  ──────────────────────────────────
dump OFF 72 Go (gitignoré)                      content script (liste Carrefour)
   │  scripts/off-subset.sql (DuckDB)              parse tuile → EAN
   ▼                                               sendMessage{mode:'local', input}
off-scores-fr.csv (gitignoré)                            │
   │  scripts/build-scores-dataset.ts                    ▼
   ▼  (tri + pack 1 octet + gzip + garde-fou)     service worker
apps/extension/public/data/                         dataset.lookup(ean)  ◀── scores-fr.bin.gz
   ├─ scores-fr.bin.gz   (~2 Mo, COMMITÉ)            hit → Product (scores), 0 réseau
   └─ scores-fr.meta.json (count, date, version)     miss + local → null, 0 réseau
                                                      miss + remote-ok → API throttlée (filet)
```

**Principe qui élimine le 429 :** un scan de liste envoie `mode:'local'` → le worker répond **uniquement** depuis le dataset, **0 appel réseau** → aucune rafale possible. L'API n'est sollicitée que sur `mode:'remote-ok'` (déclencheurs survol/fiche ; câblage UI = travail DOM ultérieur, mais le worker le supporte dès maintenant).

### Trois unités isolées

1. **Pipeline de génération** (`scripts/`, build-time) — produit le `.bin.gz`. Ignore tout du runtime.
2. **Lecteur de dataset** (`packages/core`) — pur : `ArrayBuffer → lookups`. Aucune dépendance chrome/réseau/gzip. Testable trivialement.
3. **Intégration worker** (`apps/extension`) — charge le fichier bundlé, branche le lookup en amont du matcher API existant.

## 4. Pipeline de génération

Déclenché par un script pnpm `dataset:build`. Deux étapes :

1. **Extraction SQL** — `scripts/off-subset.sql` (existant, à compléter) : produits FR avec ≥1 score, EAN `\d{8,14}`, **triés par EAN numérique**, en CSV.
2. **Packing** — `scripts/build-scores-dataset.ts` (nouveau, via `tsx`) :
   - lit le CSV, valide chaque ligne (EAN numérique, grades ∈ a-e, nova ∈ 1-4) ;
   - dé-duplique sur l'EAN (garde le premier) ;
   - encode, écrit le buffer, **gzip** (`node:zlib`), sort `apps/extension/public/data/scores-fr.bin.gz` ;
   - écrit `scores-fr.meta.json` : `{ formatVersion, count, generatedAt, dumpDate, sourceCount }` ;
   - **garde-fou** : si `count` chute de >20 % vs le meta précédent → exit ≠ 0, rien d'écrit (protège contre un dump tronqué).

La logique d'encodage pure vit dans `scripts/pack-scores.ts` (importable, testable sans disque).

Reproductibilité documentée dans `scripts/README.md` (télécharger le dump → `dataset:build`).

## 5. Format binaire

`scores-fr.bin` (avant gzip) :

```
Offset 0      : magic     4 octets   "NSD1"  (Nitide Scores Dataset v1)
Offset 4      : count     uint32 LE  N = nombre d'enregistrements
Offset 8      : eans      Float64[N] LE  EAN en Number, TRIÉS croissant
Offset 8+8N   : scores    Uint8[N]       octet packé, aligné par index sur eans
```

- **EAN** : `Number(ean)`, exact car max EAN-13 ≈ 10¹³ < 2⁵³. Tri ⇒ recherche binaire.
- **Octet de score** : `((nutri·6) + green)·5 + nova`, où `nutri,green ∈ {0=absent, 1=a … 5=e}`, `nova ∈ {0=absent, 1 … 4}`. Max = 179 < 256.
  Décodage : `nova = b % 5 ; green = (Math.floor(b / 5)) % 6 ; nutri = Math.floor(b / 30)`.
- **magic + formatVersion** : le lecteur refuse un fichier incompatible.

Taille : 16 + 9·594 k ≈ **5,3 Mo brut → ~2 Mo gzippé** (commité).
Commités : `scores-fr.bin.gz` + `scores-fr.meta.json`. Gitignorés : `.csv` intermédiaire, `.bin` non compressé, dump source.

## 6. Runtime

### A. Lecteur core — `packages/core/src/scores-dataset.ts`

```ts
export interface ScoreTriple {
  nutriScore: NutriScore | null;
  greenScore: GreenScore | null;
  nova: NovaGroup | null;
}

export interface ScoresDataset {
  readonly count: number;
  lookup(ean: string): ScoreTriple | null; // recherche binaire O(log n)
}

// Valide magic + version, crée les vues Float64Array/Uint8Array (zéro-copie)
// sur le buffer décompressé. Lève si format incompatible.
export function parseScoresDataset(buffer: ArrayBuffer): ScoresDataset;
```

- `lookup` : `Number(ean)` → recherche binaire → décode l'octet → `ScoreTriple`. EAN non numérique ou absent → `null`.
- Aucune dépendance chrome/réseau/gzip. Exporté depuis `packages/core/src/index.ts`.

### B. Chargement worker — `apps/extension/src/background/dataset.ts` (nouveau)

```ts
// Lazy + mémoïsé. DecompressionStream('gzip') est natif en service worker.
export function loadBundledDataset(): Promise<ScoresDataset | null>;
```

- `fetch(chrome.runtime.getURL('data/scores-fr.bin.gz'))` → `DecompressionStream('gzip')` → `arrayBuffer` → `parseScoresDataset`.
- Échec (fichier manquant, décompression KO, format invalide) → log warn + `null` → dégradation « tout miss », jamais de crash. Promesse mémoïsée.

### C. Matcher — `background/matcher.ts` + `background/index.ts` + `shared/messages.ts`

Le message gagne un mode (défaut `'local'`) :

```ts
type MatchMode = 'local' | 'remote-ok';
```

Logique worker :

1. `ean` présent → `dataset.lookup(ean)`. **Hit** → construit un `Product` (scores du dataset ; `name`/`brand` du `MatchInput` ; `offUrl` dérivé de l'EAN ; additifs/allergènes `undefined`). Retour immédiat, **0 réseau**.
2. **Miss + `local`** → `null`. **0 réseau.** ← supprime la rafale/les 429.
3. **Miss + `remote-ok`** → fallback sur le `matchProduct`/API throttlé **existant** (inchangé).

### D. Content script

Changement minimal : le scan de liste envoie `mode:'local'`. Parser, badge, scheduler **inchangés** (DOM hors scope).

**Conséquence :** pire cas réseau d'une page de liste : **37 appels en rafale → 0**.

## 7. Gestion d'erreur

| Situation                                | Comportement                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `.bin.gz` absent / `fetch` échoue        | `loadBundledDataset` → `null`, log warn. Lookups = miss. `local` → pas de badge ; `remote-ok` → API. Pas de crash. |
| Décompression / magic / version invalide | `parseScoresDataset` lève → capturé → `null` (même dégradation).                                                   |
| EAN non numérique / hors dataset         | `lookup` → `null`.                                                                                                 |
| Garde-fou build : `count` chute >20 %    | Script de génération exit ≠ 0, rien écrit.                                                                         |

Principe : **une donnée manquante ne casse jamais le runtime** — toujours « pas de badge » ou « fallback API », jamais une exception fatale.

## 8. Tests (Vitest)

1. **Lecteur core** (cœur) : round-trip encode/décode sur les 180 combinaisons valides ; `lookup` hit/miss/bornes/EAN non numérique/dataset vide ; rejet buffer mauvais magic/version.
2. **Contrat écrivain ↔ lecteur** (critique) : packer quelques enregistrements via `scripts/pack-scores.ts` puis relire via `parseScoresDataset` → garantit la non-divergence packer/lecteur.
3. **Matcher extension** : `local`+hit → Product sans appel client (mock, 0 appel) ; `local`+miss → `null`, 0 appel ; `remote-ok`+miss → fallback, client appelé ; dataset `null` → comportement « tout miss ».

Les tests existants (parser, badge, scheduler, throttle, cache, off-client) restent verts.

## 9. Hors scope (assumé)

- Parsing/injection DOM live (problème B) — investigation séparée.
- Déclencheur UI survol/fiche du `mode:'remote-ok'` — viendra avec le travail DOM.
- Fiche produit détaillée (M4).
- Régénération automatisée du dataset en CI.

## 10. Fichiers touchés

**Nouveaux :** `packages/core/src/scores-dataset.ts`, `packages/core/tests/scores-dataset.test.ts`, `apps/extension/src/background/dataset.ts`, `scripts/build-scores-dataset.ts`, `scripts/pack-scores.ts`, `scripts/README.md`, `apps/extension/public/data/scores-fr.bin.gz` (commit), `apps/extension/public/data/scores-fr.meta.json` (commit), tests matcher.

**Modifiés :** `packages/core/src/index.ts` (exports), `apps/extension/src/shared/messages.ts` (mode), `apps/extension/src/background/matcher.ts` + `index.ts` (dataset-first), `apps/extension/src/content/carrefour/index.ts` (`mode:'local'`), `scripts/off-subset.sql` (ORDER BY + filtre EAN), `package.json` (script `dataset:build`), `.gitignore`, `PROJECT.md` / `CLAUDE.md` (note d'archi).
