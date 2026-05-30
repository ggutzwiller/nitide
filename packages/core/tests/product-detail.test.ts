import { describe, expect, it } from 'vitest';
import {
  OffTransientError,
  createDetailClient,
  parseProductDetail,
} from '../src/product-detail.ts';

const RAW = {
  code: '3560070546879',
  product_name: 'Pâtes',
  brands: 'Carrefour, Carrefour Classic',
  nutriscore_grade: 'a',
  environmental_score_grade: 'b',
  nova_group: 1,
  nutrient_levels: { fat: 'low', 'saturated-fat': 'low', sugars: 'low', salt: 'moderate' },
  nutriments: {
    'energy-kcal_100g': 350,
    fat_100g: 1.5,
    'saturated-fat_100g': 0.3,
    salt_100g: 0.01,
  },
  additives_tags: ['en:e160a', 'en:e322'],
  allergens_tags: ['en:gluten'],
  ingredients_analysis_tags: ['en:vegan', 'en:vegetarian', 'en:palm-oil-free'],
};

describe('parseProductDetail', () => {
  it('maps a full payload', () => {
    const d = parseProductDetail(RAW)!;
    expect(d.ean).toBe('3560070546879');
    expect(d.brand).toBe('Carrefour');
    expect(d.nutriScore).toBe('a');
    expect(d.greenScore).toBe('b');
    expect(d.nova).toBe(1);
    expect(d.nutrientLevels).toEqual({
      fat: 'low',
      saturatedFat: 'low',
      sugars: 'low',
      salt: 'moderate',
    });
    expect(d.nutriments).toEqual({ energyKcal: 350, fat: 1.5, saturatedFat: 0.3, salt: 0.01 });
    expect(d.additives).toEqual(['E160a', 'E322']);
    expect(d.allergens).toEqual(['gluten']);
    expect(d.analysis).toEqual({ vegan: true, vegetarian: true, palmOilFree: true });
    expect(d.offUrl).toBe('https://world.openfoodfacts.org/product/3560070546879');
  });

  it('falls back to ecoscore_grade and tolerates missing blocks', () => {
    const d = parseProductDetail({
      code: '1234567890123',
      product_name: 'X',
      ecoscore_grade: 'c',
    })!;
    expect(d.greenScore).toBe('c');
    expect(d.nutrientLevels).toBeUndefined();
    expect(d.nutriments).toBeUndefined();
    expect(d.additives).toBeUndefined();
    expect(d.analysis).toBeUndefined();
  });

  it('returns null when there is neither a name nor a code', () => {
    expect(parseProductDetail({})).toBeNull();
  });

  it('only sets diet flags that are positively true', () => {
    const d = parseProductDetail({
      code: '1234567890123',
      product_name: 'X',
      ingredients_analysis_tags: ['en:non-vegan', 'en:vegetarian'],
    })!;
    expect(d.analysis).toEqual({ vegetarian: true });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createDetailClient.fetchProductDetail', () => {
  it('returns a parsed product on status 1', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        status: 1,
        product: { code: '3560070546879', product_name: 'Pâtes', nutriscore_grade: 'a' },
      })) as typeof fetch;
    const client = createDetailClient({ fetch: fetchImpl });
    const d = await client.fetchProductDetail('3560070546879');
    expect(d?.nutriScore).toBe('a');
  });

  it('returns null when the product is absent (status 0)', async () => {
    const client = createDetailClient({
      fetch: (async () => jsonResponse({ status: 0 })) as typeof fetch,
    });
    expect(await client.fetchProductDetail('0000000000000')).toBeNull();
  });

  it('throws OffTransientError on 429', async () => {
    const client = createDetailClient({
      fetch: (async () => jsonResponse({}, 429)) as typeof fetch,
    });
    await expect(client.fetchProductDetail('3560070546879')).rejects.toBeInstanceOf(
      OffTransientError,
    );
  });

  it('throws OffTransientError on a network failure', async () => {
    const client = createDetailClient({
      fetch: (async () => {
        throw new Error('network');
      }) as typeof fetch,
    });
    await expect(client.fetchProductDetail('3560070546879')).rejects.toBeInstanceOf(
      OffTransientError,
    );
  });
});
