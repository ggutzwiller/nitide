# CLAUDE.md — notes de travail

> Notes d'archi et d'état d'avancement, apprises en codant. Toute décision produit/tech
> non tranchée ici → clarifier avec Grégoire avant d'implémenter.
> Ne commit jamais de toi-même, laisse moi relire.

## En une phrase

Extension Chrome (MV3, Vite + Preact + TS) qui affiche les scores Open Food Facts
(Nutri-Score, Green-Score, Nova) sur les vignettes produit de Carrefour.fr et Intermarché.com,
plus une landing Astro sur nitide.fr. Monorepo pnpm. Tout client-side, zéro back-end, zéro tracking.

## Commandes

| Commande         | Effet                                                  |
| ---------------- | ------------------------------------------------------ |
| `pnpm test`      | Vitest sur tous les workspaces (core + extension)      |
| `pnpm typecheck` | `tsc --noEmit` partout                                 |
| `pnpm lint`      | ESLint flat config                                     |
| `pnpm build`     | Build `packages/*` puis `apps/*` (extension → `dist/`) |
| `pnpm dev`       | Landing + extension en watch parallèle                 |
| `pnpm format`    | Prettier (écrit)                                       |

État au 2026-06-13 : **lint clean, typecheck clean, 72 tests verts, build OK** (extension + web).
Extension publiée sur le Chrome Web Store (ID `eapegbbomnddmdhohkplmeoikhfjdagf`).

## Architecture — points à ne pas réapprendre

- **Deux mondes isolés + passage de messages** : le content script vit dans la page du marchand (voit le DOM), le service worker dans un contexte `chrome-extension://` (charge le dataset bundlé, parle à l'API OFF pour la fiche). Pas de mémoire partagée → RPC via `chrome.runtime.sendMessage` / `onMessage`, deux canaux dans `src/shared/messages.ts` : `MATCH_CHANNEL` (badges de liste, réponse depuis le dataset, **zéro réseau**) et `DETAIL_CHANNEL` (fiche produit, le worker interroge OFF en live).
- **Moteur partagé + adaptateurs par marchand** : toute la logique commune (scan, scheduler débouncé, injection badge, cycle de la fiche, observation SPA) vit dans `src/content/engine/`. Chaque marchand fournit un `Retailer` (`src/content/<marchand>/retailer.ts`) qui décrit ses sélecteurs, son extraction d'EAN et ses points d'injection. Marchands supportés : **Carrefour** (`carrefour.fr`) et **Intermarché** (`intermarche.com`).
- **Extraction EAN** : Carrefour porte l'EAN sur `data-testid="<EAN>"` de chaque `<article>` (fallback : segment de l'URL produit `/p/<slug>-<ean>`). Intermarché n'a pas de testid EAN → on lit le dernier segment du lien produit `/produit/<slug>/<ean>`. Puis lookup local dans le dataset. Détails DOM Carrefour : [`apps/extension/docs/carrefour-dom.md`](./apps/extension/docs/carrefour-dom.md).
- **Source des badges de liste (pivot M3, 2026-05-30)** : un **dataset FR bundlé** `EAN→{nutri,green,nova}` (`apps/extension/public/data/scores-fr.bin.gz`, 587 471 produits, 2 Mo). Format binaire `NSD1` (EAN Float64 trié + octet de score packé), lu via `@nitide/core` (`parseScoresDataset`, recherche binaire). Les listes ne font **aucun appel réseau** (pas de 429 possible). Régénération : `pnpm dataset:build` (voir `scripts/README.md`). Spec : `docs/superpowers/specs/2026-05-30-scores-dataset-design.md`.
- **Fiche produit (le seul appel OFF live)** : sur une fiche, le moteur extrait l'EAN de l'URL et demande le détail au worker via `DETAIL_CHANNEL`. Le worker interroge l'API OFF (`GET /api/v2/product/<ean>.json`, client minimal dans `packages/core/src/product-detail.ts`) et met la réponse en cache dans `chrome.storage.local` (`background/detail.ts`, TTL 30 j si trouvé, 24 h si absent, requêtes concurrentes coalescées). Pas de host permission OFF dans le manifest : l'appel passe par le CORS standard (OFF renvoie `Access-Control-Allow-Origin: *`). NB : l'ancien client OFF des **listes** (throttle, retry, recherche texte de l'ère M3) a bien été supprimé ; ce client fiche est volontairement minimal (un fetch produit-par-code-barres).
- **Produit non trouvé** (absent du dataset / pas sur OFF) : on n'affiche rien (pas de placeholder, décision assumée).
- **Badge** : injecté dans un Shadow DOM (isolation CSS) via `engine/badge.ts`, dans le slot retourné par le `Retailer` (Carrefour : `.product-list-card-plp-grid-new__flags` ; Intermarché : `.stime-product--details__summary`), fallback sur la tuile. Idempotent (re-render = remplace). Couleurs officielles OFF dans `src/shared/off-colors.ts`.
- **Navigation SPA (engine partagé)** : pagination (pas d'infinite scroll), navigation via `history.pushState`. Détection commune aux marchands dans `engine/runtime.ts` : `MutationObserver` sur `document.body` + poll `location.href` toutes les 500 ms + listener `popstate`. Scan débouncé, dédup par EAN.

## Conventions

- TypeScript strict, pas de `any` implicite, imports `.ts` explicites, alias `@nitide/core`.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…).
- `main` protégée, features sur `feat/...`, PR qui passe la CI.
- Licence code : PolyForm-Noncommercial-1.0.0. Données : ODbL (attribution OFF partout).
