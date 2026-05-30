# Design — M4 : panneau détaillé sur la fiche produit Carrefour

> Date : 2026-05-30 · Statut : approuvé · Milestone : M4
> Charte : [PROJECT.md](../../../PROJECT.md) · Notes : [CLAUDE.md](../../../CLAUDE.md)
> Maquette de référence : `panel-preview.html` (racine, temporaire)

## 1. Contexte & objectif

M3 affiche les 3 grades (Nutri/Green/Nova) sur les vignettes de liste, servis par le **dataset FR bundlé** (lookup local, zéro réseau). M4 ajoute un **panneau détaillé sur la fiche produit (PDP)** Carrefour, avec des données qu'on n'a pas dans le dataset (valeurs nutritionnelles, repères, additifs, allergènes, analyse ingrédients).

Ces données viennent d'un **appel OFF live, un par fiche** — au moment où l'utilisateur ouvre une page produit. C'est le seul endroit où l'API est sollicitée : **un produit, une requête, jamais de rafale → aucun risque de 429** (la cause des 429 était la rafale en page de liste, supprimée en M3).

## 2. Décisions (validées)

| Sujet                     | Choix                                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contenu du panneau        | **4 blocs** : (1) 3 grades agrandis + explication, (2) repères nutritionnels en pastilles, (3) tableau nutritionnel /100 g, (4) additifs + allergènes + badges végan/végétarien/sans huile de palme. Les blocs à couverture inégale (3/4) ne s'affichent **que si présents**. |
| Déclenchement du lookup   | **À l'ouverture de la fiche** (eager), panneau visible en état « chargement » puis rempli.                                                                                                                                                                                    |
| Cache                     | **chrome.storage.local**, TTL **30 j** pour un résultat positif, **24 h** pour un « non-trouvé », **jamais** pour une erreur transitoire.                                                                                                                                     |
| Canal                     | **Canal dédié** `DETAIL_CHANNEL` (séparé de `MATCH_CHANNEL`/dataset).                                                                                                                                                                                                         |
| Rendu                     | **Preact** dans un Shadow DOM (même pattern singleton que le tooltip).                                                                                                                                                                                                        |
| État chargement           | **Icône Nitide** (pas OFF). L'attribution « Source : Open Food Facts » apparaît en pied de l'état rempli (ODbL).                                                                                                                                                              |
| États non-trouvé / erreur | On **retire le panneau** (cohérent avec « rien si pas de données »). Pas de retry agressif en v1.                                                                                                                                                                             |

## 3. Architecture

Séparation nette des deux mondes : la **liste** garde `MATCH_CHANNEL` → dataset local (M3, inchangé) ; la **fiche** a `DETAIL_CHANNEL` → lookup OFF live.

```
content/carrefour/pdp.ts                         background/detail.ts
  détecte /p/<slug>-<ean>                           cache.get(ean)
  extrait l'EAN principal                            ├─ hit → réponse
  injecte le panneau (loading)        sendMessage     ├─ miss → fetchProductDetail(ean)
  ──────────────────────────────────────────────▶    │         ├─ ok → cache 30j → found
  panel.tsx (Preact, Shadow DOM)      DetailResponse   │         ├─ 404 → cache 24h → not-found
  rend loading / found / not-found    ◀──────────────  │         └─ 429/5xx → (pas de cache) → error
                                                       └─ dédup des requêtes en vol
                                          @nitide/core: fetchProductDetail + parseProductDetail + TtlCache
```

### Unités

**`packages/core` (reconstruction minimale de ce qui avait été supprimé en M3) :**

- `product-detail.ts` — type `ProductDetail`, client `fetchProductDetail(ean)` (fetch injectable, `OffTransientError` sur 429/5xx), `parseProductDetail(raw)`.
- `cache.ts` — `TtlCache` minimal (get/set + expiration) au-dessus de `chrome.storage.local`, + storage mémoire pour les tests.
- exports dans `index.ts`.

**`apps/extension` :**

- `shared/messages.ts` — `DETAIL_CHANNEL`, `DetailRequest { type, ean }`, `DetailResponse { status: 'found' | 'not-found' | 'error'; detail: ProductDetail | null }`, garde `isDetailRequest`.
- `background/detail.ts` — orchestration : cache-first, fetch, mise en cache selon le statut, dédup en vol. Injectable (client + storage) pour les tests.
- `background/index.ts` — enregistre le handler `DETAIL_CHANNEL` à côté de l'existant.
- `content/carrefour/pdp.ts` — détection PDP + extraction EAN + injection/cycle de vie du panneau (ré-injection sur navigation SPA, mémorise l'EAN courant).
- `content/carrefour/panel.tsx` — composant Preact + Shadow DOM singleton, états loading/found/not-found.

**Inchangé :** badges de liste, dataset, tooltip de survol, `off-colors.ts` (réutilisé).

## 4. Modèle de données

```ts
type Level = 'low' | 'moderate' | 'high';

interface ProductDetail {
  ean: string;
  name: string;
  brand: string | null;
  nutriScore: NutriScore | null;
  greenScore: GreenScore | null;
  nova: NovaGroup | null;
  nutrientLevels?: { fat?: Level; saturatedFat?: Level; sugars?: Level; salt?: Level };
  nutriments?: {
    energyKcal?: number;
    fat?: number;
    saturatedFat?: number;
    carbohydrates?: number;
    sugars?: number;
    proteins?: number;
    salt?: number;
    fiber?: number;
  };
  additives?: string[]; // E-numbers nettoyés, ex. "E160a"
  allergens?: string[]; // dérivés de allergens_tags
  analysis?: { vegan?: boolean; vegetarian?: boolean; palmOilFree?: boolean };
  offUrl: string;
}
```

**Champs OFF demandés** (`fields=`) : `code, product_name, brands, nutriscore_grade, environmental_score_grade, ecoscore_grade, nova_group, nutrient_levels, nutriments, additives_tags, allergens_tags, ingredients_analysis_tags`.

**Règles de parsing :**

- `nutrient_levels` : objet `{ fat, "saturated-fat", sugars, salt }` → `Level`.
- `nutriments` : on lit les clés `*_100g` (`energy-kcal_100g`, `fat_100g`, `saturated-fat_100g`, `carbohydrates_100g`, `sugars_100g`, `proteins_100g`, `salt_100g`, `fiber_100g`), chacune optionnelle.
- `additives_tags` : `"en:e160a"` → `"E160a"` (strip préfixe langue, uppercase E-number).
- `allergens_tags` : `"en:gluten"` → `"gluten"` (strip préfixe). _(Libellés FR jolis = polish ultérieur.)_
- `ingredients_analysis_tags` : `vegan = tags.includes('en:vegan')`, `vegetarian = includes('en:vegetarian')`, `palmOilFree = includes('en:palm-oil-free')`. Badge affiché seulement si `true`.

## 5. Flux & états

1. Boot du content script : en plus du scan de liste, `pdp` teste `location.pathname` contre `/p/<slug>-<ean>`. Si match → EAN extrait (regex slug, déjà utilisée par le parser).
2. Injection immédiate du panneau **loading** dans `.pdp-hero-wrapper__badges` (repli : après le `<h1>` produit).
3. `DetailRequest{ean}` → worker → réponse `{status, detail}`.
4. Bascule d'état :
   - `found` → panneau rempli ;
   - `not-found` / `error` → panneau retiré.
5. **Navigation SPA** : au changement de `location.href`, si nouvel EAN → retrait de l'ancien panneau, ré-injection loading, nouvelle requête. EAN courant mémorisé pour éviter une ré-injection inutile.

## 6. Gestion d'erreur (dégradation gracieuse)

| Situation                                                   | Comportement                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Produit absent d'OFF (404 / status 0)                       | `not-found` → pas de panneau ; caché 24 h.                                          |
| 429 / 5xx / réseau / timeout                                | `error` → pas de panneau ; non caché (re-tentera à la prochaine visite).            |
| Worker endormi / RPC échoue                                 | `catch` côté content → pas de panneau.                                              |
| Échec de parsing d'un champ                                 | Le champ devient `undefined`, son bloc ne s'affiche pas ; le reste du panneau rend. |
| Slot `.pdp-hero-wrapper__badges` absent (refonte Carrefour) | Repli après le `<h1>` ; si absent aussi → pas de panneau.                           |

## 7. Tests (Vitest)

- **core / `parseProductDetail`** : payload complet ; champs manquants ; mapping `nutrient_levels`→`Level` ; extraction `nutriments` `*_100g` ; nettoyage additifs (`en:e160a`→`E160a`) ; allergènes ; mapping `ingredients_analysis_tags`→booléens.
- **core / `TtlCache`** : get/set, expiration, miss.
- **core / `fetchProductDetail`** : `fetch` mocké → 200/found, 404/null, 429→`OffTransientError` (jamais de réseau réel).
- **extension / `detail.ts`** : cache-first (client non appelé sur hit) ; `not-found` mis en cache (TTL court) ; `error` non mis en cache ; dédup d'une requête en vol.
- **extension / extraction EAN PDP** : fonction pure `extractPdpEan(url)` — cas `/p/...-<ean>`, non-PDP, EAN absent.
- **panel.tsx** : rendu Preact/Shadow difficile en happy-dom → on teste les helpers purs de formatage si présents ; le rendu visuel + le lien OFF sont **validés à la main** (cf. preview).

## 8. Hors scope (v1)

- Libellés FR « jolis » des allergènes/additifs (on affiche les tags nettoyés).
- Retry sur erreur transitoire.
- Points numériques Nutri/Eco-Score, labels (bio/AOP), empreinte carbone.
- Panneau repliable / réglages.

## 9. Fichiers touchés

**Nouveaux :** `packages/core/src/product-detail.ts` (+ test), `packages/core/src/cache.ts` (+ test), `apps/extension/src/background/detail.ts` (+ test), `apps/extension/src/content/carrefour/pdp.ts` (+ test extraction EAN), `apps/extension/src/content/carrefour/panel.tsx`.

**Modifiés :** `packages/core/src/index.ts` (exports), `apps/extension/src/shared/messages.ts` (canal détail), `apps/extension/src/background/index.ts` (handler), `apps/extension/src/content/carrefour/index.ts` (boot du module pdp), éventuellement `manifest.config.ts` (RAS attendu : `world.openfoodfacts.org` est déjà dans `host_permissions`).
