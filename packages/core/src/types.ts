// Shared types consumed by the extension (and future integrations).
// Score grades use the same lowercase letters that Open Food Facts emits.

export type NutriScore = 'a' | 'b' | 'c' | 'd' | 'e';
export type GreenScore = 'a' | 'b' | 'c' | 'd' | 'e';
export type NovaGroup = 1 | 2 | 3 | 4;

export interface Product {
  ean: string | null;
  name: string;
  brand: string | null;
  nutriScore: NutriScore | null;
  greenScore: GreenScore | null;
  nova: NovaGroup | null;
  additives?: string[];
  allergens?: string[];
  offUrl: string;
}

export interface MatchInput {
  ean?: string;
  name: string;
  brand?: string;
}

// Subset of the OFF v2 product payload we rely on. Permissive on purpose:
// the API emits many more fields, and some fields are sometimes missing.
export interface OFFRawProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nutriscore_grade?: string;
  // Green-Score (renamed in 2024). New deployments emit
  // `environmental_score_grade`; legacy products only carry `ecoscore_grade`.
  environmental_score_grade?: string;
  ecoscore_grade?: string;
  nova_group?: number;
  additives_tags?: string[];
  allergens_tags?: string[];
}

export interface OFFProductResponse {
  code?: string;
  status: 0 | 1;
  status_verbose?: string;
  product?: OFFRawProduct;
}

export interface OFFSearchResponse {
  count: number;
  page?: number;
  page_count?: number;
  page_size?: number;
  products: OFFRawProduct[];
}
