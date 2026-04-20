// Open Food Facts v2 client.
//
// Design:
// - Definitively "not found" (HTTP 404, `status: 0`, empty search results) is
//   returned as `null` so callers can cache it.
// - Transient failures (HTTP 429, 5xx, network error, timeout) throw
//   `OffTransientError`. The caller is expected to surface a null to the user
//   *without* caching it — otherwise a temporary OFF outage would blacklist
//   working products for the whole negative-TTL window.
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

export class OffTransientError extends Error {
  constructor(
    public readonly status: number,
    /**
     * Server-suggested back-off, in milliseconds. Parsed from the HTTP
     * `Retry-After` header when OFF rate-limits us. Undefined when OFF did not
     * advertise a cool-down (older endpoints, network-level failures, etc.) —
     * callers should fall back to a sensible default.
     */
    public readonly retryAfterMs: number | undefined = undefined,
  ) {
    super(`OFF transient error (HTTP ${status})`);
    this.name = 'OffTransientError';
  }
}

function parseRetryAfter(header: string | null, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const at = Date.parse(trimmed);
  if (Number.isFinite(at)) return Math.max(0, at - now);
  return undefined;
}

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
      if (res.status === 429 || res.status >= 500) {
        const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
        throw new OffTransientError(res.status, retryAfterMs);
      }
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof OffTransientError) throw err;
      // Aborts, DNS / network issues, JSON parse errors — all transient.
      throw new OffTransientError(0);
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
