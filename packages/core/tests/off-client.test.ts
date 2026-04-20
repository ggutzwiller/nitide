import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFF_BASE_URL, createOffClient, parseProduct } from '../src/off-client.ts';
import type { OFFProductResponse, OFFRawProduct, OFFSearchResponse } from '../src/types.ts';

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function mockFetch(impl: FetchImpl) {
  return vi.fn<FetchImpl>(impl);
}

function firstRequestedUrl(fetchMock: ReturnType<typeof mockFetch>): string {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error('fetch was never called');
  return String(call[0]);
}

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(status: number): Response {
  return new Response('', { status });
}

const NUTELLA_PRODUCT: OFFRawProduct = {
  code: '3017620422003',
  product_name: 'Nutella',
  brands: 'Nutella, Ferrero',
  nutriscore_grade: 'e',
  environmental_score_grade: 'c',
  ecoscore_grade: 'unknown',
  nova_group: 4,
  additives_tags: ['en:e322', 'en:e322i'],
  allergens_tags: ['en:milk', 'en:nuts', 'en:soybeans'],
};

afterEach(() => {
  vi.useRealTimers();
});

describe('createOffClient.fetchByBarcode', () => {
  it('returns the parsed product on status 1', async () => {
    const body: OFFProductResponse = {
      code: NUTELLA_PRODUCT.code,
      status: 1,
      status_verbose: 'product found',
      product: NUTELLA_PRODUCT,
    };
    const fetchMock = mockFetch(async () => okResponse(body));
    const client = createOffClient({ fetch: fetchMock });

    const product = await client.fetchByBarcode('3017620422003');

    expect(product).not.toBeNull();
    expect(product).toMatchObject({
      ean: '3017620422003',
      name: 'Nutella',
      brand: 'Nutella',
      nutriScore: 'e',
      greenScore: 'c',
      nova: 4,
      offUrl: `${OFF_BASE_URL}/product/3017620422003`,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = firstRequestedUrl(fetchMock);
    expect(url).toContain('/api/v2/product/3017620422003.json');
    expect(url).toContain('fields=');
  });

  it('returns null when status is 0 (product not found)', async () => {
    const fetchMock = mockFetch(async () => okResponse({ code: 'x', status: 0 }));
    const client = createOffClient({ fetch: fetchMock });
    expect(await client.fetchByBarcode('000')).toBeNull();
  });

  it('returns null on HTTP 404', async () => {
    const fetchMock = mockFetch(async () => errorResponse(404));
    const client = createOffClient({ fetch: fetchMock });
    expect(await client.fetchByBarcode('x')).toBeNull();
  });

  it('returns null on HTTP 500', async () => {
    const fetchMock = mockFetch(async () => errorResponse(500));
    const client = createOffClient({ fetch: fetchMock });
    expect(await client.fetchByBarcode('x')).toBeNull();
  });

  it('returns null on a network error', async () => {
    const fetchMock = mockFetch(async () => {
      throw new TypeError('network down');
    });
    const client = createOffClient({ fetch: fetchMock });
    expect(await client.fetchByBarcode('x')).toBeNull();
  });

  it('returns null when the response has no product field', async () => {
    const fetchMock = mockFetch(async () => okResponse({ code: 'x', status: 1 }));
    const client = createOffClient({ fetch: fetchMock });
    expect(await client.fetchByBarcode('x')).toBeNull();
  });

  it('aborts and returns null when the request exceeds the timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const client = createOffClient({ fetch: fetchMock, timeoutMs: 100 });

    const pending = client.fetchByBarcode('x');
    await vi.advanceTimersByTimeAsync(101);
    await expect(pending).resolves.toBeNull();
  });

  it('encodes the EAN into the URL', async () => {
    const fetchMock = mockFetch(async () =>
      okResponse({ code: 'x', status: 0 } satisfies OFFProductResponse),
    );
    const client = createOffClient({ fetch: fetchMock });
    await client.fetchByBarcode('abc/def');
    expect(firstRequestedUrl(fetchMock)).toContain('abc%2Fdef');
  });
});

describe('createOffClient.searchByText', () => {
  it('returns the first product of the result list', async () => {
    const body: OFFSearchResponse = {
      count: 2,
      page: 1,
      page_count: 1,
      page_size: 1,
      products: [NUTELLA_PRODUCT, { ...NUTELLA_PRODUCT, code: '999', product_name: 'Other' }],
    };
    const fetchMock = mockFetch(async () => okResponse(body));
    const client = createOffClient({ fetch: fetchMock });

    const product = await client.searchByText('nutella');
    expect(product?.name).toBe('Nutella');
    const url = firstRequestedUrl(fetchMock);
    expect(url).toContain('/api/v2/search?');
    expect(url).toContain('search_terms=nutella');
  });

  it('concatenates name and brand into search_terms', async () => {
    const fetchMock = mockFetch(async () => okResponse({ count: 0, products: [] }));
    const client = createOffClient({ fetch: fetchMock });
    await client.searchByText('tagliatelle', 'Barilla');
    expect(firstRequestedUrl(fetchMock)).toContain('search_terms=tagliatelle+Barilla');
  });

  it('returns null on an empty result set', async () => {
    const fetchMock = mockFetch(async () => okResponse({ count: 0, products: [] }));
    const client = createOffClient({ fetch: fetchMock });
    expect(await client.searchByText('unknown')).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    const fetchMock = mockFetch(async () => errorResponse(503));
    const client = createOffClient({ fetch: fetchMock });
    expect(await client.searchByText('x')).toBeNull();
  });
});

describe('parseProduct', () => {
  it('prefers environmental_score_grade over legacy ecoscore_grade', () => {
    const product = parseProduct({
      code: '1',
      product_name: 'X',
      environmental_score_grade: 'b',
      ecoscore_grade: 'd',
    });
    expect(product?.greenScore).toBe('b');
  });

  it('falls back to ecoscore_grade when the new field is absent', () => {
    const product = parseProduct({
      code: '1',
      product_name: 'X',
      ecoscore_grade: 'd',
    });
    expect(product?.greenScore).toBe('d');
  });

  it('drops invalid grades and invalid nova values', () => {
    const product = parseProduct({
      code: '1',
      product_name: 'X',
      nutriscore_grade: 'unknown',
      ecoscore_grade: 'not-applicable',
      nova_group: 99,
    });
    expect(product?.nutriScore).toBeNull();
    expect(product?.greenScore).toBeNull();
    expect(product?.nova).toBeNull();
  });

  it('keeps only the first brand before a comma', () => {
    const product = parseProduct({
      code: '1',
      product_name: 'X',
      brands: 'Nutella, Ferrero, Other',
    });
    expect(product?.brand).toBe('Nutella');
  });

  it('returns null when both name and code are missing', () => {
    expect(parseProduct({})).toBeNull();
  });

  it('rejects malformed EANs but keeps the rest of the product', () => {
    const product = parseProduct({ code: 'abc', product_name: 'Bread' });
    expect(product?.ean).toBeNull();
    expect(product?.name).toBe('Bread');
  });

  it('falls back to the code when the product name is empty', () => {
    const product = parseProduct({ code: '1234567890' });
    expect(product?.name).toBe('1234567890');
  });

  it('returns null brand when brands field is missing', () => {
    const product = parseProduct({ code: '1', product_name: 'X' });
    expect(product?.brand).toBeNull();
  });
});
