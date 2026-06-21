# Courses U DOM (coursesu.com)

Findings from DOM captures under `./fixtures/` (`coursesu-grid.html`,
`coursesu-product.html`). Ground truth for `src/content/coursesu/retailer.ts`;
update it whenever the parser changes or a redesign invalidates the selectors.

## Platform

Salesforce Commerce Cloud (Demandware) + Vue 3. Navigation is a **full page
reload** (no `history.pushState`), so the shared engine's MutationObserver +
`location.href` poll cover page/category changes without special handling.

## Listing tiles

Each tile root is `div.product-tile[data-itemid]` (63 tiles in the grid
fixture). **The EAN sits right on the tile**: `data-item-ean="<EAN-13>"`, the
same "EAN in the DOM" situation as Carrefour, so no text search, no network.

| Field | Source                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| EAN   | `element.getAttribute('data-item-ean')`, validated `/^\d{8,14}$/`                                                  |
| Name  | `h2.product-name .name-link` textContent, whitespace-collapsed (a nested `<span>U</span>` brand prefixes the text) |
| Href  | `a[href^="/p/"]` (reference only; the trailing `<id>.html` is an internal id, not the EAN)                         |

Brand is not extracted: it is fused into the name and has no clean DOM node.

## What Courses U already shows

Nutri-Score is server-rendered on some tiles (`.icons-plp` wrapper, `<img
alt="Nutriscore C">`). Green-Score and Nova are not shown. Nitide adds all three
badges anyway (different source, may diverge), like the other retailers.

## Badge injection point

`.product-image-content` (present on every tile, holds the score-icon area),
fallback to the tile itself. The badge is injected in a Shadow DOM, so CSS is
isolated either way.

## Product page (PDP)

URL shape `/p/<slug>/<internal-id>.html`, where the trailing id is a Courses U
internal id, **not the EAN**. So the PDP reads the EAN from the DOM:

1. Main product internal id: `#pdpMain[data-itemid]`.
2. The page embeds one HTML-encoded JSON blob per product in
   `data-tc-product-tile` attributes. Find the one whose `id` matches the main
   id and read its `EAN` field.

Panel anchor: the container of `h1.pdp-product-name`.

## No structured data

No `Product` JSON-LD with `gtin13`/`sku`. The product catalogue with EANs is in
a `tc_vars` GTM `<script>` variable, but we never need it: the EAN is on the
tile (`data-item-ean`) and in the PDP `data-tc-product-tile` blobs.
