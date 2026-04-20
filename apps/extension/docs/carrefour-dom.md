# Carrefour DOM — product list pages

Findings from DOM captures under `./fixtures/`:

- `search-grid.html` — full search result page (`/s?q=pâtes`), 237 KB, 37 tiles
- `tile-single.html` — single tile (`<li>`), 7 KB
- `product-page.html` — PDP (for M4, kept around)

This document is the ground truth for `src/content/carrefour/parser.ts`. Update it whenever we touch the parser, or when a Carrefour redesign invalidates the selectors below.

## Tile shape

The listing is a classic `<ul>` of product cards:

```html
<ul class="product-list-grid product-list-grid--grid product-list-grid--new">
  <li class="product-list-grid__item">
    <article data-testid="3560070546879" class="product-list-card-plp-grid-new">…</article>
  </li>
  …
</ul>
```

**Every `<article>` inside the grid carries `data-testid="<ean>"`** — a 13-digit EAN-13 barcode. 37/37 tiles in `search-grid.html`, no exceptions. This is a production stability signal: Carrefour uses the EAN as the test identifier, so it's unlikely to churn casually.

## Data extraction

| Field              | Source                                                                                                          | Selector / rule                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **EAN** (primary)  | `<article data-testid="…">` attribute                                                                           | `/^\d{8,14}$/`                               |
| **EAN** (fallback) | Last dash-separated segment of the `<a href>` slug, e.g. `/p/pates-pipe-rigate-carrefour-classic-3560070546879` | Regex at slug end                            |
| **Name**           | `<h3 class="… product-card-title__text …">` text                                                                | `article h3.product-card-title__text`        |
| **Brand**          | First nested `<a class="c-link--tone-accent c-link--bold">` text inside the title container                     | `article a.c-link--tone-accent.c-link--bold` |
| **Product URL**    | `<a href="/p/…">` (there are two nested `<a>` — non-standard HTML but tolerated by browsers)                    | `article a[href^="/p/"]`                     |

The EAN path is what matters — **we can always hit OFF's fast `/api/v2/product/{ean}` endpoint and skip `searchByText` entirely**. Name and brand are captured as extras (for the tooltip and for later debugging) but are not on the critical lookup path.

## What Carrefour already shows

Nutri-Score is server-rendered on the tile (`<img alt="Nutri-Score: A" src="/images/badges/flag-nutriscore-a.svg">`, 60 occurrences in the fixture). Green-Score and Nova are **not** shown. Nitide adds all three badges anyway — they come from a different data source (OFF) and may disagree with Carrefour's own Nutri-Score; showing all three keeps the origin consistent.

## Structured data

No JSON-LD script, no `__NEXT_DATA__` blob (confirmed by the user — `document.querySelector('script[type="application/ld+json"]')` and `document.getElementById('__NEXT_DATA__')` both `undefined`). Carrefour's PLP hydrates from internal APIs invisible to us. The extractable signal is the DOM only — which is fine, because the EAN is sitting right there.

## Page lifecycle

- **Pagination, not infinite scroll.** The fixture contains a classic `pagination` block (page bar, numbered buttons). No auto-load on scroll.
- **SPA navigation.** Filter changes, page changes, and category navigation swap the tile grid in place without a full reload — `location.href` updates via `history.pushState`, the DOM mutates.
- **Lazy loading is per-image only** (`loading="lazy"` on tile `<img>`s). The tile markup itself is present the moment the `<li>` is inserted, so we can process it immediately.

The orchestrator therefore just listens for **new `<article[data-testid]>` nodes anywhere under `document.body`** with a `MutationObserver`, debounces the scan at 300 ms, and processes only tiles it hasn't seen before (tracked by testid). This uniform strategy handles pagination, filter changes, SPA navigation and lazy-rendered tiles without special cases.

## Badge injection point

Preferred: append a Shadow-DOM host inside `.product-list-card-plp-grid-new__flags` — the same container that already holds Carrefour's own Nutri-Score badge. Visual consistency is free.

Fallback: if `__flags` is missing (class rename), append the host as the last child of the `<article>` directly. The Shadow DOM isolates our styles, so we don't care about Carrefour's CSS collisions.

## OFF rate-limit reality check

PROJECT.md said "10 req/sec côté client". The official OFF limits are different:

- `/api/v2/product/{ean}` — **100 req/min** (≈ 1.67 req/s sustained)
- `/api/v2/search` — **10 req/min** (very low)
- Facet queries — 2 req/min

Because every Carrefour tile exposes its EAN, we only ever use the product endpoint. The content script's internal throttle defaults to **1 request every 100 ms = 10 req/s burst** (matches the product spec) but callers can tighten it. Cache hits (30-day TTL via `@nitide/core`) don't consume a slot. On a fresh pâtes page (37 tiles), first visit pays ~4 s of throttled requests; every subsequent visit within 30 days is instant.

`searchByText` is left available in `@nitide/core` for other retailers, but **on Carrefour it is never called** — and if it were, 10 req/min would be the ceiling.

## Known unknowns

- Non-standard tiles: `product-list-grid__item--BF` (Black Friday?) and `product-list-grid__matcha` appear once each in the fixture. Both still wrap a regular `<article[data-testid]>`, so they flow through the same parser path.
- Products without an EAN (house loose produce, services): not observed in the fixture. If they exist, the parser skips them (no testid ⇒ no lookup ⇒ no badges).
- Carrefour localisation/A-B tests could rename `product-list-card-plp-grid-new` to something else. The parser falls back to the structural rule — `article` whose `data-testid` matches `/^\d{8,14}$/` — which is robust to class churn.
