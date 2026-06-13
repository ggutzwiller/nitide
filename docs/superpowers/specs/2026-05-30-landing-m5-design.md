# Design — Landing complète (M5, étapes 1-6)

> Date : 2026-05-30 · Statut : approuvé · Milestone : M5 (hors déploiement)
> Maquette : `landing-demo-preview.html` (racine, temporaire)

## Objectif

Transformer la landing (`apps/web`) — aujourd'hui un hero placeholder + la section démo — en une vraie page de présentation : hero, démo, « comment ça marche », « pourquoi Nitide », FAQ, + deux pages légales. **Déploiement (étape 7) traité séparément.**

## Décisions (validées)

- **Page unique** `index.astro` : Hero → Démo (existante) → Comment ça marche → Pourquoi Nitide → FAQ → Footer. Plus `/legal/privacy` et `/legal/mentions`.
- **Landing « live »** : proposition de valeur au présent. **CTA unique** ocre (`#D4A24C`) « Ajouter à Chrome » pointant vers un placeholder (`#`), à activer en M6 avec l'URL du Chrome Web Store.
- **Pas de mise en avant open source** sur le site (ni CTA « voir le code », ni mention footer). Le repo/licence restent inchangés, on ne les communique simplement pas.
- **Valeurs nutritionnelles repliées** (`<details>` fermé par défaut, summary + chevron) — les sites de courses les affichent déjà. **Légère animation d'ouverture/fermeture** en CSS pur (`::details-content` + `interpolate-size`, ~0,2 s hauteur + fondu ; repli instantané sur les navigateurs non compatibles). Appliqué **sur la landing ET dans l'extension** (`panel.tsx`).
- **Mentions légales** : éditeur = Grégoire Gutzwiller, contact `[à compléter]` ; hébergeur = GitHub Inc. (adresse publique) ; pas de mention de licence du code.
- **Ton** : FR, tutoiement, direct et clair (charte §4).

## Copie (figée)

**Hero** — Titre : « Vois _clair_ dans tes courses. » · Sous-titre : « Nitide affiche le Nutri-Score, le Green-Score et le Nova sur chaque produit, directement sur ton site de courses. Sans scanner, sans tracking. » · CTA : « Ajouter à Chrome » · Réassurance : « Gratuit · Sans pub · Aucune donnée collectée ».

**Comment ça marche** (3 étapes) — 1. _Installe Nitide_ : Ajoute l'extension à Chrome en un clic. · 2. _Fais tes courses_ : Va sur Carrefour.fr comme d'habitude. · 3. _Compare d'un coup d'œil_ : Les scores s'affichent sur les produits, le détail sur la fiche.

**Pourquoi Nitide** (4 cartes) — _Sans friction_ : Pas de scan, pas d'appli à ouvrir. Les scores sont là, sur les produits. · _Ta vie privée d'abord_ : Aucune donnée collectée, aucun tracking, aucun compte. · _Trois angles, pas un_ : Nutrition (Nutri-Score), environnement (Green-Score) et transformation (Nova), plus le détail sur la fiche. · _Des données fiables_ : Les scores viennent d'Open Food Facts, la base alimentaire collaborative.

**FAQ** (5) — _C'est vraiment gratuit ?_ « Oui, et sans pub. C'est un projet personnel, pas un business. » · _Sur quels sites ?_ « Carrefour.fr pour commencer. D'autres enseignes viendront. » · _Mes données ?_ « Rien : Nitide ne collecte aucune donnée et ne te piste pas. Les scores des listes sont calculés en local ; seule la fiche produit interroge Open Food Facts, sans aucune information personnelle. » · _D'où viennent les scores ?_ « D'Open Food Facts (licence ODbL). » · _Pourquoi un produit n'a pas de score ?_ « Parce qu'il n'est pas encore dans Open Food Facts. »

## Pages légales

**`/legal/privacy`** — Aucune donnée personnelle collectée. Aucun tracking, aucune analytics, aucun compte. Le cache reste local (`chrome.storage.local`). Seul appel externe : Open Food Facts (API publique, sans authentification), **uniquement à l'ouverture d'une fiche produit**, sans aucune donnée personnelle ; les scores des listes sont servis depuis un jeu de données embarqué (aucun réseau). Justification des permissions (`storage`, `host_permissions` Carrefour + Open Food Facts). Contact `[à compléter]`.

**`/legal/mentions`** — Éditeur : Grégoire Gutzwiller, projet personnel non commercial, contact `[à compléter]`. Hébergeur : GitHub Inc., 88 Colin P. Kelly Jr Street, San Francisco, CA 94107, USA. Données affichées : Open Food Facts sous licence ODbL.

## Visuel & implémentation

- Tokens de la charte (cream, green-dark, green-sage, ocre, ink/ink-muted, border-soft), Instrument Serif (titres) + Geist (texte). CTA en **ocre**. Sections alternées cream/blanc. Responsive (grilles → 1 colonne sur mobile).
- **Fichiers** : `apps/web/src/pages/index.astro` (étendu), `apps/web/src/pages/legal/privacy.astro`, `apps/web/src/pages/legal/mentions.astro`. Les pages légales réutilisent `Layout.astro` avec un style prose sobre + lien retour accueil. Footer (sur les 3 pages) : attribution ODbL + crédit photos + liens vers les 2 pages légales.
- **Données démo** inchangées (Maïs doux / Kinder Bueno, vraies données OFF, photos bundlées).
- Validation : `pnpm --filter @nitide/web build` + revue visuelle. Pas de tests (présentationnel).

## Cross-cutting (déjà appliqué)

Le repli `<details>` des valeurs nutritionnelles a aussi été appliqué à l'extension (`apps/extension/src/content/carrefour/panel.tsx`) — commit séparé (extension), hors du périmètre landing.

## Hors scope

- **Déploiement** sur nitide.fr (M5 étape 7) — traité ensuite.
- Publication Chrome Web Store + activation du CTA (M6).
- En-tête de navigation sticky, newsletter, sélecteur de langue.
