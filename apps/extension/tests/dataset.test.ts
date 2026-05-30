import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadBundledDataset', () => {
  it('returns null (and does not throw) when the asset is missing', async () => {
    vi.stubGlobal('chrome', { runtime: { getURL: (p: string) => p } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, body: null }));

    const { loadBundledDataset } = await import('../src/background/dataset.ts');
    expect(await loadBundledDataset()).toBeNull();
  });

  it('returns null when fetch itself rejects', async () => {
    vi.stubGlobal('chrome', { runtime: { getURL: (p: string) => p } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { loadBundledDataset } = await import('../src/background/dataset.ts');
    expect(await loadBundledDataset()).toBeNull();
  });

  it('memoizes the load so fetch runs at most once', async () => {
    vi.stubGlobal('chrome', { runtime: { getURL: (p: string) => p } });
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, body: null });
    vi.stubGlobal('fetch', fetchMock);

    const { loadBundledDataset } = await import('../src/background/dataset.ts');
    await loadBundledDataset();
    await loadBundledDataset();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
