# Nitide — Project Charter

> Extension Chrome qui affiche les scores Open Food Facts (Nutri-Score, Green-Score, Nova) sur les sites de courses en ligne, à commencer par Carrefour.
>
> **Ce document est la source de vérité du projet.** Claude Code doit le lire au début de chaque session. Toute décision produit/tech non listée ici est à clarifier avec l'utilisateur avant implémentation.

---

## 1. Vision

Donner aux consommateurs français la transparence nutritionnelle et environnementale pendant qu'ils font leurs courses en ligne, sans changer d'onglet, sans scanner, sans friction.

**Positionnement** : l'outil simple, clair, et open source. Pas un énième feed d'alertes anxiogènes — une info factuelle à côté du produit.

**Nom** : Nitide  
**Domaine** : nitide.fr  
**Statut** : side project, potentiellement monétisable à terme, open source dès le départ.

---

## 2. Scope MVP (v1)

### Extension Chrome

- **Site supporté** : Carrefour.fr uniquement
- **Scores affichés** : Nutri-Score (A-E), Green-Score (A-E), Nova (1-4)
- **Points d'intégration** :
  - Badge compact sur chaque vignette produit dans les listes (3 mini-badges côte à côte)
  - Tooltip au survol du badge (détails : score complet, libellé, éventuellement 1-2 data points)
  - Panneau détaillé sur la fiche produit (tous les scores + additifs + allergènes + lien OFF)
- **Matching produit → OFF** :
  1. Priorité : code-barres / EAN si détectable dans le DOM (URL produit, JSON-LD, data-attributes)
  2. Fallback : recherche texte (nom + marque) via API OFF
  3. Pas de logique de confiance — soit on a un match, soit on affiche rien
- **Produit non trouvé** : rien n'est affiché (on ne pollue pas l'UI). Contribution OFF : post-v1.
- **Cache** : `chrome.storage.local`, TTL 30 jours, clé = code EAN ou hash(nom+marque).
- **Settings** : aucun (zero-config). Page d'options viendra plus tard.

> **Mise à jour 2026-05-30 — source des scores.** L'appel API en rafale sur les pages de liste déclenchait des 429 (l'API OFF produit limite à ~10 req en burst). Décision : les badges sont désormais servis par un **dataset FR bundlé** (`EAN→{nutri,green,nova}`, 587 471 produits, ~2 Mo), lookup local instantané, **aucun appel réseau**. Tout le code d'appel à l'API OFF (client, cache, throttle, recherche texte des points 1-2 ci-dessus) a été **retiré** : produit absent du dataset = pas de badge. Un éventuel lookup live (survol/fiche) sera rebâti plus tard avec son propre déclencheur. Détails : [spec](docs/superpowers/specs/2026-05-30-scores-dataset-design.md). Régénération du dataset : `pnpm dataset:build`.

### Landing page

- **URL** : nitide.fr
- **Objectif** : présenter le projet + renvoyer vers le Chrome Web Store (une fois publié)
- **Pages** : single-page (hero + fonctionnalités + comment ça marche + FAQ) + `/legal/privacy` + `/legal/mentions`
- **Langue** : FR uniquement
- **Analytics** : aucune en v1

### Hors scope v1 (explicitement)

- Autres retailers (Leclerc, Monoprix, Auchan, etc.) → v2
- Settings utilisateur, personnalisation des scores affichés → v2
- Contribution OFF depuis l'extension → v2
- Version anglaise → plus tard
- Monétisation (premium, features payantes) → plus tard, à évaluer selon traction
- Back-end propre → non nécessaire, on reste full client-side

---

## 3. Stack technique

### Monorepo

- **Gestionnaire** : pnpm workspaces
- **Structure** :
  ```
  nitide/
  ├── apps/
  │   ├── web/           # Landing Astro + GitHub Pages
  │   └── extension/     # Extension Chrome Vite + Preact + TS
  ├── packages/
  │   └── core/          # Logique OFF, types partagés, matching
  ├── .github/
  │   └── workflows/     # CI : build, lint, test, deploy landing
  ├── PROJECT.md         # ← ce fichier
  └── README.md
  ```

### Extension

- **Manifest V3** (obligatoire)
- **Langage** : TypeScript (strict)
- **UI** : Preact (3 KB, API React-like)
- **Build** : Vite + `@crxjs/vite-plugin`
- **Styles** : CSS modules ou `@preact/signals` + styles scopés ; pas de Tailwind dans l'extension (encapsulation plus propre dans un content script)
- **Permissions manifest** :
  - `storage` (cache)
  - `host_permissions` : `https://www.carrefour.fr/*` et `https://world.openfoodfacts.org/*`
  - Rien d'autre en v1

### Landing

- **Framework** : Astro (SSG pur, parfait pour une landing statique, excellent SEO, léger)
- **Styles** : Tailwind CSS
- **Hébergement** : GitHub Pages
- **Domaine** : nitide.fr, avec CNAME vers GitHub Pages, HTTPS via Let's Encrypt (auto)
- **Déploiement** : GitHub Actions sur push `main`

### Package `core`

- TypeScript pur, zéro dépendance runtime lourde
- Exporte :
  - Types : `Product`, `NutriScore`, `GreenScore`, `NovaGroup`, `OFFResponse`
  - Client OFF : `fetchByBarcode(ean)`, `searchByText(name, brand?)`
  - Fonction de matching : `matchProduct(domProduct) → Promise<Product | null>`
  - Utilitaires de cache (abstraction au-dessus de `chrome.storage.local`)

### Tests

- **Vitest** pour les tests unitaires
- Couverture prioritaire :
  - Matching produit (parsing DOM Carrefour, extraction EAN, appels OFF)
  - Cache (TTL, éviction, collisions)
  - Parsing des réponses OFF
- Pas de tests E2E en v1 (trop coûteux en maintenance sur un DOM tiers)

### CI/CD

- **GitHub Actions** dès le début, workflow unique :
  - Lint (ESLint + Prettier)
  - Type-check (tsc --noEmit)
  - Tests (Vitest)
  - Build extension (produit un `.zip` uploadable sur le Chrome Web Store)
  - Build + deploy landing sur GitHub Pages (sur `main` uniquement)

---

## 4. Design system

### Couleurs

Palette vert foncé chaleureux + ocre/ambré. Claire, pas agressive.

- **Vert foncé (primaire)** : `#1F3D2B` (texte, accents forts)
- **Vert sauge (secondaire)** : `#7A9E7E` (éléments calmes, bordures)
- **Ocre/ambre (accent)** : `#D4A24C` (CTA, highlights, accent chaleureux)
- **Crème (fond)** : `#FAF6EE` (background clair, pas du blanc pur)
- **Blanc cassé** : `#FFFFFF` pour cartes
- **Neutres** :
  - Texte principal : `#1A1A1A`
  - Texte secondaire : `#5C5C5C`
  - Bordures : `#E5E1D6`

Pour les scores eux-mêmes (badges Nutri-Score, Green-Score, Nova), **on respecte les couleurs officielles OFF** (A=vert foncé, E=rouge, etc.) — c'est une convention universelle, on ne touche pas.

### Typographie

- **Titres** : Instrument Serif (Google Fonts, italic autorisé pour du caractère)
- **Texte** : Geist (Google Fonts ou `@vercel/geist-font`)
- **Mono** (si besoin, ex. code dans FAQ dev) : Geist Mono

### Ton

- Direct, clair, légèrement chaleureux
- Pas de jargon, pas de promesses marketing grandiloquentes
- Tutoiement sur la landing (plus proche, cohérent avec le côté outil perso)
- Mentions explicites : "Projet open source", "Basé sur Open Food Facts"

### Logo

- Monogramme "N" ou symbole simple en SVG, généré par Claude Code
- Version pleine + version icône (pour favicon et icône d'extension 16/32/48/128px)
- Couleurs : vert foncé sur crème (et variante monochrome)

---

## 5. Conformité & légal

### RGPD & Privacy

- L'extension ne collecte **aucune donnée personnelle**
- Le cache reste local (`chrome.storage.local`)
- Aucun tracking, aucun analytics, aucun appel vers un back-end Nitide
- Seuls appels externes : API Open Food Facts (publique, pas d'auth)
- Privacy policy à générer (template RGPD-compliant) reflétant ces faits

### Mentions légales

- Obligatoires pour un site FR même perso
- Éditeur : [À remplir par Grégoire — nom, email de contact, statut auto-entrepreneur/perso]
- Hébergeur : GitHub Inc. (adresse publique disponible)

### Open Food Facts

- Données sous licence **ODbL**
- Attribution obligatoire, présente :
  - Footer de la landing : "Données fournies par [Open Food Facts](https://openfoodfacts.org) sous licence ODbL"
  - Dans l'extension : mention sur chaque tooltip/panneau ("Source : Open Food Facts")
  - Dans le README du repo

### Chrome Web Store

- Privacy policy obligatoire (lien dans la fiche)
- Description des permissions (pourquoi `storage`, pourquoi `host_permissions`)
- Justification du domaine `openfoodfacts.org` dans la liste des hosts

### Licence du code

- Le code du repo est publié sous [**PolyForm Noncommercial 1.0.0**](https://polyformproject.org/licenses/noncommercial/1.0.0/)
- "Source-available" : le code est public, auditable, modifiable et redistribuable pour **tout usage non commercial** (projet perso, recherche, éducation, associations, institutions publiques)
- L'usage **commercial** par des tiers (revente, SaaS, intégration dans un produit payant, etc.) est interdit sans accord explicite
- Le champ `license` dans chaque `package.json` utilise l'identifiant SPDX `PolyForm-Noncommercial-1.0.0`
- Ce choix est volontaire : on veut la transparence d'un projet ouvert sans céder la possibilité d'une monétisation future (cf. §2 — "potentiellement monétisable à terme")
- Les données affichées par l'extension restent sous licence **ODbL** d'Open Food Facts (cf. ci-dessus) — ce sont deux licences distinctes qui cohabitent

---

## 6. Conventions de code

- **Formatting** : Prettier avec config standard
- **Linting** : ESLint (preset `@typescript-eslint/recommended` + `eslint-plugin-preact`)
- **Commits** : format Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, etc.)
- **Branches** : `main` protégée, features sur branches `feat/...`, PR requise
- **TypeScript** : `strict: true`, pas de `any` implicite, imports absolus depuis packages

---

## 7. Milestones

### M1 — Scaffold (cette étape)

- Monorepo initialisé
- Stack installée, premier build vert
- CI qui tourne
- Landing accessible sur nitide.fr (placeholder "Bientôt")
- Extension qui s'installe en dev mode et log "Nitide activé" sur carrefour.fr

### M2 — Core OFF

- Package `core` avec client OFF fonctionnel
- Cache `chrome.storage.local` avec TTL
- Tests unitaires sur le client et le cache

### M3 — Extension Carrefour

- Parser DOM pour vignettes produit et fiche produit sur carrefour.fr
- Extraction EAN + fallback recherche texte
- Affichage des 3 badges sur les vignettes
- Tooltip au survol

### M4 — Fiche produit détaillée

- Panneau détaillé sur la fiche produit Carrefour
- Affichage additifs, allergènes, lien OFF
- Gestion des états (loading, not found, erreur)

### M5 — Landing complète

- Hero, features, FAQ
- Privacy policy + mentions légales
- Design final appliqué
- Déployée sur nitide.fr

### M6 — Publication Chrome Web Store

- Screenshots, fiche store, description
- Icônes finalisées
- Soumission à la review Chrome

---

## 8. Questions ouvertes (à trancher plus tard)

- Faut-il un bouton "contribuer à OFF" pour les produits non trouvés ? (post-v1)
- Comment gérer les produits non-alimentaires listés par Carrefour (droguerie, hygiène) ? Pour l'instant : pas de badge. À confirmer selon ce que renvoie OFF.
- Monétisation potentielle : premium avec features avancées, ou rester 100% gratuit + donation ? À évaluer à 1000+ users.
