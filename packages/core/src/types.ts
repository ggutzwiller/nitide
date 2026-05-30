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
  offUrl: string;
}

export interface MatchInput {
  ean?: string;
  name: string;
  brand?: string;
}
