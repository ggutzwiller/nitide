# Spec — Support Courses U (coursesu.com)

> Design validé avec Grégoire le 2026-06-21. Cible : afficher les 3 badges OFF
> (Nutri-Score, Green-Score, Nova) sur les vignettes et la fiche produit de
> coursesu.com, en réutilisant le moteur de content-script existant.

## 1. Contexte et constat

Courses U est la troisième enseigne, après Carrefour et Intermarché. Le moteur
générique (`src/content/engine/*`) est déjà conçu pour accueillir une nouvelle
enseigne via un simple adaptateur `Retailer` (`src/content/engine/types.ts`).

Constat issu de l'analyse des fixtures (`docs/fixtures/coursesu-grid.html`,
`docs/fixtures/coursesu-product.html`) :

- Plateforme **Salesforce Commerce Cloud (Demandware) + Vue 3**, navigation par
  **rechargement complet** (pas de `history.pushState`).
- **L'EAN est exposé directement dans le DOM** : chaque vignette racine
  `div.product-tile[data-itemid]` porte `data-item-ean="<EAN13>"`
  (63 vignettes dans la fixture de liste). C'est l'équivalent du `data-testid`
  de Carrefour : pas de parsing JSON ni d'appel réseau nécessaire pour la liste.
- Courses U affiche déjà son **propre Nutri-Score** (`alt="Nutriscore C"`), mais
  ni Green-Score ni Nova. On ajoute quand même nos **3 badges OFF** partout, par
  cohérence avec Carrefour/Intermarché (source différente, peut diverger).
- Sur la **fiche produit**, l'URL `/p/<slug>/<id-interne>.html` ne contient
  **pas** l'EAN, seulement un id interne Courses U. L'EAN du produit principal
  vit dans un blob JSON HTML-encodé `data-tc-product-tile` dont l'`id`
  correspond au `data-itemid` de `#pdpMain`.

## 2. Décisions validées

1. **PDP `extractEan` lit le DOM** (pas l'URL) : id principal via
   `#pdpMain[data-itemid]`, puis EAN dans le blob `data-tc-product-tile`
   correspondant. C'est la seule déviation par rapport à Carrefour/Intermarché,
   où l'EAN est dans l'URL.
2. **3 badges OFF partout** (liste + fiche), y compris quand U montre déjà son
   Nutri-Score.

## 3. Architecture

Aucune modification du moteur. On ajoute un adaptateur isolé, comme Intermarché.

| Fichier                            | Rôle                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `src/content/coursesu/retailer.ts` | Adaptateur `Retailer` : seul endroit avec des sélecteurs Courses U.                  |
| `src/content/coursesu/index.ts`    | Point d'entrée content-script : `bootWhenReady(coursesuRetailer)`.                   |
| `manifest.config.ts`               | Nouvelle entrée `content_scripts` + `host_permissions` `https://www.coursesu.com/*`. |
| `tests/coursesu-retailer.test.ts`  | Tests sur les fixtures, miroir d'`intermarche-retailer.test.ts`.                     |
| `docs/coursesu-dom.md`             | Note de findings DOM (miroir de `carrefour-dom.md`, en anglais).                     |

## 4. Comportement de l'adaptateur

Constantes :

- `TILE_SELECTOR = 'div.product-tile[data-itemid]'`
- `EAN_PATTERN = /^\d{8,14}$/`
- `PDP_URL = /\/p\/[^?#]*\/(\d+)\.html(?:[?#]|$)/` — détecte une fiche produit et
  capture l'id interne (sert de garde, pas de source d'EAN).

### Liste (`extractProducts(root)`)

Pour chaque `TILE_SELECTOR` :

- **EAN** : `element.getAttribute('data-item-ean')`, retenu seulement s'il
  valide `EAN_PATTERN`. Pas d'EAN → tile ignorée (return null).
- **Nom** : `h2.product-name .name-link` (textContent trimé). Vide → tile ignorée.
- **Marque** : non extraite du DOM en v1 (elle est fondue dans le nom ; pas de
  nœud propre fiable). Champ `brand` laissé absent.
- **href** : `a[href^="/p/"]` si présent (référence/debug, non critique).

`findLiveTile(node)` : `document.querySelector('div.product-tile[data-item-ean="<ean>"]')`
(via `CSS.escape`). Re-query après un éventuel remplacement de nœud.

`findBadgeSlot(tile)` : conteneur près du Nutri-Score existant. Ordre de
priorité à confirmer à l'implémentation sur la fixture (candidat
`.product-image-content`), **fallback → la vignette elle-même**. Le badge est de
toute façon injecté dans un Shadow DOM (isolation CSS).

### Fiche produit (`pdp`)

`extractEan(url)` :

1. Si `url` ne matche pas `PDP_URL` → `null` (on n'est pas sur une fiche).
2. Lire l'id principal : `document.querySelector('#pdpMain')?.getAttribute('data-itemid')`.
   Absent → `null`.
3. Parcourir les `[data-tc-product-tile]`, HTML-décoder + `JSON.parse` chaque
   blob, retourner le champ `EAN` du premier dont `id === mainId` et qui valide
   `EAN_PATTERN`. Aucun match → `null`.

`findPanelSlot()` : `h1.pdp-product-name` → son conteneur
(`closest('div')` ?? `parentElement`), comme l'ancrage Intermarché.

## 5. Manifest

```ts
// content_scripts : ajouter
{ js: ['src/content/coursesu/index.ts'], matches: ['https://www.coursesu.com/*'], run_at: 'document_idle' }
// host_permissions : ajouter 'https://www.coursesu.com/*'
```

## 6. Tests (`tests/coursesu-retailer.test.ts`)

Miroir d'`intermarche-retailer.test.ts`, sur les fixtures Courses U :

- `extractProductsFromPage` extrait toutes les vignettes de la grille
  (compter les tiles avec un `data-item-ean` valide).
- chaque EAN matche `/^\d{13}$/` ; vérifie un EAN connu de la fixture
  (ex. `3256220851145`).
- le nom est non vide et correspond pour un produit connu.
- `findLiveTile` retrouve la vignette par EAN.
- `findBadgeSlot` retourne un nœud contenu dans la vignette ; fallback → tile
  quand le slot connu est absent.
- chemins défensifs : tile sans `data-item-ean`, sans nom, EAN non valide.
- `extractPdpEan` (via DOM monté depuis la fixture PDP) : retourne l'EAN du
  produit principal ; `null` sur une page liste et sur une fiche sans
  `data-tc-product-tile` correspondant.
- `findPanelSlot` ancre sur le conteneur du `h1.pdp-product-name` ; `null` sans
  titre produit.

## 7. Ce qui ne change pas

- Lookup dataset EAN-only inchangé (`@nitide/core`), **zéro appel réseau**.
- Badge en Shadow DOM, rendu idempotent.
- Scan/observe/SPA gérés par le runtime partagé. U fait des rechargements
  complets : le `MutationObserver` + poll `location.href` couvrent le cas sans
  code spécifique.

## 8. Hors scope

- Extraction de la marque depuis le DOM (laissée à plus tard si un besoin
  tooltip se précise).
- Toute lecture du blob `tc_vars` (GTM) : inutile, l'EAN est sur la vignette.
