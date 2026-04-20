// Open Food Facts v2 client.
//
// Design:
// - Every failure mode (timeout, network, 4xx, 5xx, status=0, empty search) maps
//   to `null`. Callers never see an exception from here.
// - `fetch` is injectable so tests never touch the network.
// - User-Agent is set as a courtesy; Chromium will strip it from extension
//   fetches in practice, but it helps when the client runs in Node.
import type {
  GreenScore,
  NutriScore,
  NovaGroup,
  OFFProductResponse,
  OFFRawProduct,
  OFFSearchResponse,
  Product,
} from './types.ts';

export const OFF_BASE_URL = 'https://world.openfoodfacts.org';
export const DEFAULT_TIMEOUT_MS = 8_000;
export const USER_AGENT = 'Nitide/0.1.0 (contact@nitide.fr)';

const REQUESTED_FIELDS = [
  'code',
  'product_name',
  'brands',
  'nutriscore_grade',
  'environmental_score_grade',
  'ecoscore_grade',
  'nova_group',
  'additives_tags',
  'allergens_tags',
].join(',');

export interface OffClient {
  fetchByBarcode(ean: string): Promise<Product | null>;
  searchByText(name: string, brand?: string): Promise<Product | null>;
}

export interface OffClientDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
}

export function createOffClient(deps: OffClientDeps = {}): OffClient {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = deps.baseUrl ?? OFF_BASE_URL;

  async function request<T>(url: string): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          From: 'nitide-extension@nitide.fr',
          Accept: 'application/json',
        },
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchByBarcode(ean: string): Promise<Product | null> {
    const url = `${baseUrl}/api/v2/product/${encodeURIComponent(ean)}.json?fields=${REQUESTED_FIELDS}`;
    const body = await request<OFFProductResponse>(url);
    if (!body || body.status !== 1 || !body.product) return null;
    return parseProduct(body.product);
  }

  async function searchByText(name: string, brand?: string): Promise<Product | null> {
    const terms = brand ? `${name} ${brand}` : name;
    const params = new URLSearchParams();
    params.set('search_terms', terms);
    params.set('fields', REQUESTED_FIELDS);
    params.set('page_size', '1');
    const url = `${baseUrl}/api/v2/search?${params.toString()}`;
    const body = await request<OFFSearchResponse>(url);
    const first = body?.products?.[0];
    if (!first) return null;
    return parseProduct(first);
  }

  return { fetchByBarcode, searchByText };
}

const LETTER_GRADES: ReadonlySet<string> = new Set(['a', 'b', 'c', 'd', 'e']);

export function parseProduct(raw: OFFRawProduct): Product | null {
  const name = (raw.product_name ?? '').trim();
  const code = raw.code?.trim() ?? '';
  if (!name && !code) return null;

  const greenRaw = raw.environmental_score_grade ?? raw.ecoscore_grade;

  return {
    ean: code && /^\d{8,14}$/.test(code) ? code : null,
    name: name || code,
    brand: firstBrand(raw.brands),
    nutriScore: toNutriScore(raw.nutriscore_grade),
    greenScore: toGreenScore(greenRaw),
    nova: toNova(raw.nova_group),
    additives: raw.additives_tags,
    allergens: raw.allergens_tags,
    offUrl: code ? `${OFF_BASE_URL}/product/${encodeURIComponent(code)}` : '',
  };
}

function firstBrand(brands: string | undefined): string | null {
  if (!brands) return null;
  const first = brands.split(',')[0]?.trim();
  return first ? first : null;
}

function toNutriScore(value: string | undefined): NutriScore | null {
  if (!value) return null;
  const v = value.toLowerCase();
  return LETTER_GRADES.has(v) ? (v as NutriScore) : null;
}

function toGreenScore(value: string | undefined): GreenScore | null {
  if (!value) return null;
  const v = value.toLowerCase();
  return LETTER_GRADES.has(v) ? (v as GreenScore) : null;
}

function toNova(value: number | undefined): NovaGroup | null {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  return null;
}
