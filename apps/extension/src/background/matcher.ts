// Resolves a DOM-extracted product to its scores, using the bundled FR dataset
// only, no network. A miss returns null (no badge). This is what keeps a full
// page of tiles at zero network requests, so OFF's rate limit can never bite.
//
// If we later want live OFF lookups (hover / product page), that path will be
// built separately with its own trigger, it deliberately does not exist yet.
import type { MatchInput, Product, ScoreTriple, ScoresDataset } from '@nitide/core';

// Where OFF hosts product pages, used to build the "view on Open Food Facts"
// link on a matched product.
const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/product';

export interface Matcher {
  /** Look a product up in the bundled dataset. Synchronous; null on a miss. */
  match(input: MatchInput): Product | null;
}

export function createMatcher(dataset: ScoresDataset | null): Matcher {
  return {
    match(input) {
      if (!input.ean || !dataset) return null;
      const triple = dataset.lookup(input.ean);
      return triple ? toProduct(input, input.ean, triple) : null;
    },
  };
}

// Name/brand come from the DOM-extracted input; scores from the dataset; the OFF
// URL is derived from the EAN. Additives/allergens aren't in the dataset.
function toProduct(input: MatchInput, ean: string, triple: ScoreTriple): Product {
  return {
    ean,
    name: input.name,
    brand: input.brand ?? null,
    nutriScore: triple.nutriScore,
    greenScore: triple.greenScore,
    nova: triple.nova,
    offUrl: `${OFF_PRODUCT_URL}/${encodeURIComponent(ean)}`,
  };
}
