// Shared types used across the extension and (later) the OFF client.

export type NutriScore = 'A' | 'B' | 'C' | 'D' | 'E';
export type GreenScore = 'A' | 'B' | 'C' | 'D' | 'E';
export type NovaGroup = 1 | 2 | 3 | 4;

export interface Product {
  barcode: string | null;
  name: string;
  brand: string | null;
  nutriScore: NutriScore | null;
  greenScore: GreenScore | null;
  nova: NovaGroup | null;
  additives: string[];
  allergens: string[];
  offUrl: string | null;
}

export interface OFFResponse {
  status: 0 | 1;
  code: string;
  product?: Record<string, unknown>;
}

export interface DomProduct {
  barcode: string | null;
  name: string;
  brand: string | null;
}
