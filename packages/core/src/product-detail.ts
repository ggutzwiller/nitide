// Open Food Facts product-detail model + a minimal live client, rebuilt for M4.
// Used only on the product page (PDP): one lookup per product, cached — never in
// the bursty list-page path, so OFF's rate limit can't bite.
import type { GreenScore, NovaGroup, NutriScore } from './types.ts';

export const OFF_BASE_URL = 'https://world.openfoodfacts.org';

export type Level = 'low' | 'moderate' | 'high';

export interface ProductDetail {
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
  additives?: string[];
  allergens?: string[];
  analysis?: { vegan?: boolean; vegetarian?: boolean; palmOilFree?: boolean };
  offUrl: string;
}

const GRADES = new Set(['a', 'b', 'c', 'd', 'e']);
const LEVELS = new Set(['low', 'moderate', 'high']);

// --- Coercion helpers. OFF's payload is permissive: fields may be missing or
// have unexpected shapes, so every value is validated before we trust it. ---

/** A score grade letter (a–e), lower-cased, or null. */
function grade<T extends string>(value: unknown): T | null {
  return typeof value === 'string' && GRADES.has(value.toLowerCase())
    ? (value.toLowerCase() as T)
    : null;
}

/** A nutrient level (low/moderate/high), or undefined. */
function level(value: unknown): Level | undefined {
  return typeof value === 'string' && LEVELS.has(value) ? (value as Level) : undefined;
}

/** A finite number, or undefined. */
function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** A NOVA group (1–4), or null. */
function toNova(value: unknown): NovaGroup | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}

/** The first brand from OFF's comma-separated `brands` string, or null. */
function firstBrand(brands: unknown): string | null {
  if (typeof brands !== 'string') return null;
  const first = brands.split(',')[0]?.trim();
  return first ? first : null;
}

/** Strip OFF's language prefix ("en:gluten" → "gluten"), transform, drop empties. */
function cleanTags(tags: unknown, transform: (s: string) => string): string[] | undefined {
  if (!Array.isArray(tags) || tags.length === 0) return undefined;
  const out = tags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => transform(t.replace(/^[a-z]{2}:/, '')));
  return out.length ? out : undefined;
}

/** Keep the object only if it has at least one defined value, else undefined. */
function compact<T extends object>(obj: T): T | undefined {
  return Object.values(obj).some((v) => v !== undefined) ? obj : undefined;
}

export function parseProductDetail(
  raw: Record<string, unknown> | null | undefined,
): ProductDetail | null {
  const r = (raw ?? {}) as Record<string, unknown>;

  // Nothing to show without at least a name or a barcode.
  const name = (typeof r['product_name'] === 'string' ? r['product_name'] : '').trim();
  const code = (typeof r['code'] === 'string' ? r['code'] : '').trim();
  if (!name && !code) return null;

  // Nested OFF sub-objects we read several keys from.
  const nl = (r['nutrient_levels'] ?? {}) as Record<string, unknown>;
  const nm = (r['nutriments'] ?? {}) as Record<string, unknown>;
  const tags: string[] = Array.isArray(r['ingredients_analysis_tags'])
    ? (r['ingredients_analysis_tags'] as string[])
    : [];

  const nutrientLevels = compact({
    fat: level(nl['fat']),
    saturatedFat: level(nl['saturated-fat']),
    sugars: level(nl['sugars']),
    salt: level(nl['salt']),
  });
  const nutriments = compact({
    energyKcal: num(nm['energy-kcal_100g']),
    fat: num(nm['fat_100g']),
    saturatedFat: num(nm['saturated-fat_100g']),
    carbohydrates: num(nm['carbohydrates_100g']),
    sugars: num(nm['sugars_100g']),
    proteins: num(nm['proteins_100g']),
    salt: num(nm['salt_100g']),
    fiber: num(nm['fiber_100g']),
  });
  const analysis = compact({
    vegan: tags.includes('en:vegan') || undefined,
    vegetarian: tags.includes('en:vegetarian') || undefined,
    palmOilFree: tags.includes('en:palm-oil-free') || undefined,
  });
  // OFF additive codes keep a lowercase suffix letter, e.g. "e160a" → "E160a".
  const additives = cleanTags(r['additives_tags'], (s) => s.charAt(0).toUpperCase() + s.slice(1));
  const allergens = cleanTags(r['allergens_tags'], (s) => s);

  return {
    ean: code,
    name: name || code,
    brand: firstBrand(r['brands']),
    nutriScore: grade<NutriScore>(r['nutriscore_grade']),
    // Green-Score was renamed in 2024; fall back to the legacy ecoscore key.
    greenScore: grade<GreenScore>(r['environmental_score_grade'] ?? r['ecoscore_grade']),
    nova: toNova(r['nova_group']),

    // Optional blocks: only included when OFF actually had the data.
    ...(nutrientLevels ? { nutrientLevels } : {}),
    ...(nutriments ? { nutriments } : {}),
    ...(additives ? { additives } : {}),
    ...(allergens ? { allergens } : {}),
    ...(analysis ? { analysis } : {}),

    offUrl: code ? `${OFF_BASE_URL}/product/${encodeURIComponent(code)}` : '',
  };
}

const REQUESTED_FIELDS = [
  'code',
  'product_name',
  'brands',
  'nutriscore_grade',
  'environmental_score_grade',
  'ecoscore_grade',
  'nova_group',
  'nutrient_levels',
  'nutriments',
  'additives_tags',
  'allergens_tags',
  'ingredients_analysis_tags',
].join(',');

export class OffTransientError extends Error {
  constructor(public readonly status: number) {
    super(`OFF transient error (HTTP ${status})`);
    this.name = 'OffTransientError';
  }
}

export interface DetailClient {
  fetchProductDetail(ean: string): Promise<ProductDetail | null>;
}

export interface DetailClientDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
}

export function createDetailClient(deps: DetailClientDeps = {}): DetailClient {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? 8_000;
  const baseUrl = deps.baseUrl ?? OFF_BASE_URL;

  return {
    async fetchProductDetail(ean: string): Promise<ProductDetail | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = `${baseUrl}/api/v2/product/${encodeURIComponent(ean)}.json?fields=${REQUESTED_FIELDS}`;
        const res = await fetchImpl(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });

        // 429 / 5xx are transient — the caller must not cache them.
        if (res.status === 429 || res.status >= 500) throw new OffTransientError(res.status);
        // Any other non-OK status (e.g. 404) means "not found".
        if (!res.ok) return null;

        const body = (await res.json()) as { status?: number; product?: Record<string, unknown> };
        if (body.status !== 1 || !body.product) return null;
        return parseProductDetail(body.product);
      } catch (err) {
        // Aborts, DNS/network errors, JSON parse failures: all treated as transient.
        if (err instanceof OffTransientError) throw err;
        throw new OffTransientError(0);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
