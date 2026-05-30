# CLAUDE.md — notes de travail

> **Source de vérité produit/tech : [PROJECT.md](./PROJECT.md).** Lis-le en début de session.
> Ce fichier ne le duplique pas : il garde l'état d'avancement et les détails d'archi
> appris en codant. Toute décision non listée dans PROJECT.md → clarifier avec Grégoire.
> Ne commit jamais de toi-même, laisse moi relire.

## En une phrase

Extension Chrome (MV3, Vite + Preact + TS) qui affiche les scores Open Food Facts
(Nutri-Score, Green-Score, Nova) sur les vignettes produit de Carrefour.fr, + une landing
Astro sur nitide.fr. Monorepo pnpm. Tout client-side, zéro back-end, zéro tracking.

## Commandes

| Commande         | Effet                                                  |
| ---------------- | ------------------------------------------------------ |
| `pnpm test`      | Vitest sur tous les workspaces (core + extension)      |
| `pnpm typecheck` | `tsc --noEmit` partout                                 |
| `pnpm lint`      | ESLint flat config                                     |
| `pnpm build`     | Build `packages/*` puis `apps/*` (extension → `dist/`) |
| `pnpm dev`       | Landing + extension en watch parallèle                 |
| `pnpm format`    | Prettier (écrit)                                       |

État au 2026-05-30 : **lint clean, typecheck clean, 36 tests verts, build OK** (extension + web).

## Avancement par milestone

- **M1 Scaffold** ✅ — monorepo, stack, CI.
- **M2 Core** ✅ — `packages/core` : types partagés + le **dataset de scores** (`scores-dataset.ts`). ⚠️ Le client OFF, le cache et le matching API d'origine ont été **supprimés** lors du pivot M3 (cf. ci-dessous) — à reconstruire de zéro si un jour on rebranche l'API.
- **M3 Extension Carrefour** 🚧 — parser DOM, badge Shadow-DOM, tooltip, scheduler, matcher worker. **Pivot data-source fait** : les scores viennent d'un dataset FR bundlé (lookup local), **aucun appel réseau**. Reste : vérifier le **parsing DOM live** (problème B, non résolu) en conditions réelles.
- **M4 Fiche produit (PDP)** ⬜ — pas commencé. Fixture `docs/fixtures/product-page.html` gardée pour ça.
- **M5 Landing complète** ⬜ — `apps/web` n'a qu'un placeholder « bientôt disponible ». Manque hero/features/FAQ + `/legal/privacy` + `/legal/mentions`.
- **M6 Publication Chrome Web Store** ⬜.

## Architecture — points à ne pas réapprendre

- **Deux mondes isolés + passage de messages** : le content script vit dans la page Carrefour (voit le DOM), le service worker dans un contexte `chrome-extension://` (charge le dataset bundlé). Ils ne partagent pas de mémoire → RPC via `chrome.runtime.sendMessage` / `onMessage` (canal `MATCH_CHANNEL`, `src/shared/messages.ts`). Le worker répond depuis le dataset, **sans aucun appel réseau**.
- **Extraction EAN (Carrefour)** : **chaque `<article>` porte `data-testid="<EAN>"`** → on récupère l'EAN du DOM puis on fait un lookup local dans le dataset. Détails DOM : [`apps/extension/docs/carrefour-dom.md`](./apps/extension/docs/carrefour-dom.md).
- **Source des scores (pivot M3, 2026-05-30)** : les badges viennent d'un **dataset FR bundlé** `EAN→{nutri,green,nova}` (`apps/extension/public/data/scores-fr.bin.gz`, 587 471 produits, 2 Mo). Format binaire `NSD1` (EAN Float64 trié + octet de score packé), lu via `@nitide/core` (`parseScoresDataset`, recherche binaire). **Aucun appel à l'API OFF** → plus de 429 possible. Régénération : `pnpm dataset:build` (voir `scripts/README.md`). Spec : `docs/superpowers/specs/2026-05-30-scores-dataset-design.md`.
- **Décision assumée** : tout le code d'appel à l'API OFF (client, cache TTL, throttle, retry, recherche texte) a été **supprimé** au profit du dataset-only. Si on veut un jour des lookups live (survol/fiche), on le rebâtira de zéro avec son propre déclencheur — il n'existe volontairement pas.
- **Produit non trouvé** (absent du dataset) : on n'affiche rien (pas de placeholder). Cf. PROJECT.md.
- **Badge** : injecté dans un Shadow DOM (isolation CSS) dans `.product-list-card-plp-grid-new__flags`, fallback sur l'`<article>`. Idempotent (re-render = remplace). Couleurs officielles OFF dans `src/shared/off-colors.ts`.
- **SPA Carrefour** : pagination (pas d'infinite scroll), navigation via `history.pushState`. Détection = `MutationObserver` sur `document.body` + poll `location.href` toutes les 500 ms. Scan débouncé 300 ms, dédup par EAN.

## Conventions

- TypeScript strict, pas de `any` implicite, imports `.ts` explicites, alias `@nitide/core`.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…).
- `main` protégée, features sur `feat/...`, PR qui passe la CI.
- Licence code : PolyForm-Noncommercial-1.0.0. Données : ODbL (attribution OFF partout).
