# Multi-enseigne + support Intermarché, design

> Date : 2026-05-31. Statut : approuvé (Grégoire). PDP Intermarché ajouté le 2026-06-01 (cf. Décisions assumées).

## Objectif

Faire fonctionner l'extension sur **Intermarché** en plus de **Carrefour**, en
extrayant un moteur générique de contenu et en réduisant chaque enseigne à un
adaptateur (sélecteurs DOM + regex). Aucune régression sur Carrefour.

## Contexte

L'archi actuelle vit sous `content/carrefour/`. En la lisant, la majorité du
code est déjà agnostique de l'enseigne :

- `scheduler.ts` : débounce + dédup par EAN + drain. `resolve`/`render` injectés.
- `panel.tsx`, `tooltip.tsx` : UI pure, pilotée par `ProductDetail`/`Product`.
- `badge.ts` : rendu Shadow DOM des 3 pastilles ; seule la sélection du slot
  (`PREFERRED_SLOTS`) est propre à Carrefour.
- `index.ts` : boot + MutationObserver + poll `location.href` + popstate. Le
  glue `resolve` (canal `MATCH_CHANNEL`) est générique.

Ce qui est réellement spécifique à Carrefour :

- `parser.ts` : sélecteurs de tuile, lecture EAN via `data-testid`.
- `badge.ts` : `PREFERRED_SLOTS`.
- `pdp.ts` : regex URL `/p/<slug>-<ean>` + `SLOT_SELECTORS`, et le re-query live
  `article[data-testid="<ean>"]` dans `index.ts`.

Le background (`matcher`, `detail`, `dataset`, `messages`) est déjà 100 %
agnostique : tout passe par l'EAN. Il ne bouge pas.

## Architecture cible

Un moteur générique `content/engine/` + un adaptateur par enseigne. Le moteur
reçoit un objet `Retailer` qui encapsule tout le DOM-spécifique.

### Interface `Retailer`

```ts
export interface ProductDomNode {
  element: HTMLElement;
  ean: string;
  name: string;
  brand?: string;
  href?: string;
}

export interface RetailerPdp {
  /** URL → EAN du produit principal, ou null hors fiche. */
  extractEan(url: string): string | null;
  /** Où monter le panneau détaillé sur la fiche, ou null. */
  findPanelSlot(): HTMLElement | null;
}

export interface Retailer {
  readonly id: string;
  /** Extrait les tuiles produit d'une page de liste. */
  extractProducts(root: ParentNode): ProductDomNode[];
  /** Re-query l'élément tuile vivant (le SPA peut avoir remplacé le nœud). */
  findLiveTile(node: ProductDomNode): HTMLElement | null;
  /** Où, dans une tuile, injecter le host du badge. */
  findBadgeSlot(tile: HTMLElement): HTMLElement;
  /** Support fiche produit. Optionnel : absent => pas de panneau. */
  pdp?: RetailerPdp;
}
```

### Moteur

- `engine/types.ts` : `ProductDomNode`, `Retailer`, `RetailerPdp`.
- `engine/scheduler.ts` : la classe actuelle, renommée `Scheduler`, paramétrée
  par `extract: (root) => ProductDomNode[]` (au lieu d'appeler directement
  `extractProductsFromPage`). Reste du comportement inchangé (dédup, débounce,
  drain en parallèle).
- `engine/badge.ts` : `renderBadge(tile, product, findSlot)`. Idempotent : on
  retire le badge existant dans `tile`, puis on append dans `findSlot(tile)`.
- `engine/panel.tsx`, `engine/tooltip.tsx` : déplacés tels quels.
- `engine/pdp.ts` : `syncPanel(pdp: RetailerPdp)`, logique actuelle de
  `syncPdpPanel` mais via les hooks injectés. État `currentEan` au niveau module.
- `engine/runtime.ts` : `start(retailer: Retailer)`. Reprend l'`index.ts`
  actuel : `resolve` (MATCH_CHANNEL), Scheduler câblé sur `retailer.extractProducts`,
  `render` qui fait `findLiveTile` → `renderBadge(live, product, retailer.findBadgeSlot)`,
  MutationObserver sur `document.body`, poll 500 ms, popstate. Appelle
  `syncPanel(retailer.pdp)` au boot et à chaque navigation **uniquement si**
  `retailer.pdp` est défini.

### Adaptateurs

- `content/carrefour/retailer.ts` : porte la logique de `parser.ts` + `pdp.ts`
  actuels, expose `carrefourRetailer: Retailer` (avec `pdp`). `findLiveTile`
  re-query `article[data-testid="<ean>"]`. `findBadgeSlot` = `PREFERRED_SLOTS`
  actuels, fallback tuile.
- `content/carrefour/index.ts` : `start(carrefourRetailer)`.
- `content/intermarche/retailer.ts` : voir ci-dessous. **`pdp` ajouté le
  2026-06-01** (`extractPdpEan` + `findPanelSlot`), cf. Décisions assumées.
- `content/intermarche/index.ts` : `start(intermarcheRetailer)`.

## Spécifique Intermarché

Source : DOM réel d'une page boutique `www.intermarche.com/boutique/3056`.

- **Tuile** : `[data-testid="product-layout"]`.
- **EAN** : dans le lien `a[href^="/produit/"]`, dernier segment de chemin.
  Ex. `/produit/jus-de-pomme/3250390866442`. Lecture : href sans query/hash,
  dernier segment, validé `^\d{8,14}$`. Robuste aux slugs contenant `%`/`&`.
- **Nom** : `h2.stime-product--details__title` (texte).
- **Marque** (optionnel) : premier `<p>` de `.stime-product--details__summary`
  (ex. « Pâturages, une marque Intermarché »). Utilisé seulement pour le tooltip.
- **`findLiveTile`** : re-query par l'EAN via le href stable :
  `[data-testid="product-layout"]:has(a[href$="/<ean>"])` (`:has` OK Chrome).
  Fallback : `node.element` s'il est encore connecté.
- **`findBadgeSlot`** : slots candidats dans la tuile, en ordre de priorité :
  `.stime-product--details__summary` (le badge sous le nom/contenance), fallback
  `.stime-product-card-course`, fallback tuile. **À vérifier en live** par
  Grégoire ; le sélecteur est trivial à ajuster, comme l'a été celui de Carrefour.
- **SPA** : Next.js, routing client → couvert par le moteur (observer + poll).
- **Pas de score natif** sur les tuiles Intermarché → on apporte les 3 (Nutri,
  Green, Nova), valeur ajoutée maximale.

## Manifest

`manifest.config.ts` : deux entrées `content_scripts` (chacune son `index.ts`,
donc seul le bon bundle se charge par site) + host permissions.

```ts
content_scripts: [
  { js: ['src/content/carrefour/index.ts'],   matches: ['https://www.carrefour.fr/*'],     run_at: 'document_idle' },
  { js: ['src/content/intermarche/index.ts'], matches: ['https://www.intermarche.com/*'],  run_at: 'document_idle' },
],
host_permissions: [
  'https://www.carrefour.fr/*',
  'https://www.intermarche.com/*',
  'https://world.openfoodfacts.org/*',
],
```

## Tests

- `engine/scheduler.test.ts` (ex `scheduler.test.ts`) : passe `extract` ; même
  couverture qu'avant.
- `engine/badge.test.ts` (ex `badge.test.ts`) : `renderBadge(tile, product, findSlot)` ;
  on fournit un `findSlot` de test.
- `carrefour/retailer.test.ts` (ex `parser.test.ts` + `pdp.test.ts`) : fixtures
  existantes (`search-grid.html`, `tile-single.html`) ; `extractEan` via
  `carrefourRetailer.pdp.extractEan`. Mêmes assertions qu'avant.
- **`intermarche/retailer.test.ts`** (nouveau) + fixture
  `docs/fixtures/intermarche-grid.html` (quelques vraies tuiles extraites du dump) :
  - extrait toutes les tuiles, EAN ∈ `^\d{13}$`, contient des EAN connus
    (`3250391535583`, `3250390866442`) ;
  - nom non vide pour chaque tuile ;
  - `findBadgeSlot` renvoie un élément contenu dans la tuile.

État de sortie attendu : `pnpm typecheck` + `pnpm lint` + `pnpm test` verts,
`pnpm build` OK.

## Décisions assumées

- **PDP Intermarché ajouté (2026-06-01)** : le DOM de fiche produit a été capturé,
  donc le panneau live est branché via le hook `pdp`. L'URL fiche partage la forme
  `/produit/<slug>/<ean>` des listes (même extraction d'EAN). Le slot est ancré sur
  le `<h1>` titre produit : la carte résumé est rendue en double (jumeaux mobile
  `md:hidden` + desktop), classes Tailwind sans ancre stable, donc `findPanelSlot`
  prend le `<h1>` visible (`offsetParent`), repli sur le dernier, et monte dans sa
  carte. À vérifier en live (slot = meilleur pari, comme pour le badge des listes).
  Pas de changement de manifest : `world.openfoodfacts.org` est déjà autorisé et le
  content script matche déjà `/produit/*`.
- **Re-query par href** côté Intermarché (l'`id="stime-product-item-N"` est un
  index de rendu, pas stable ; l'EAN dans le href l'est).
- Pas de matching texte, pas d'appel réseau pour les listes : inchangé.
