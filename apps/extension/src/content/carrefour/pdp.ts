// Product detail page (PDP) integration for carrefour.fr: detect a product page,
// extract its EAN, and drive the detailed panel (loading -> filled / removed).
// The detail data comes from a single live OFF lookup, proxied to the service
// worker over DETAIL_CHANNEL (see src/background/detail.ts).
import { renderPanel, removePanel, PANEL_HOST_CLASS } from './panel.tsx';
import { DETAIL_CHANNEL, type DetailRequest, type DetailResponse } from '../../shared/messages.ts';

const PDP_EAN = /\/p\/[^?#]*-(\d{8,14})(?:[?#]|$)/;
const SLOT_SELECTORS = ['.pdp-hero-wrapper__badges', '.pdp-hero-wrapper'];

let currentEan: string | null = null;

/** Returns the main product's EAN from a Carrefour PDP URL, or null. */
export function extractPdpEan(url: string): string | null {
  const match = PDP_EAN.exec(url);
  return match ? match[1]! : null;
}

function findSlot(): HTMLElement | null {
  for (const selector of SLOT_SELECTORS) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el) return el;
  }
  const h1 = document.querySelector('h1');
  return h1?.parentElement ?? null;
}

function clearAllPanels(): void {
  document.querySelectorAll<HTMLElement>(`.${PANEL_HOST_CLASS}`).forEach((host) => host.remove());
}

async function requestDetail(ean: string): Promise<DetailResponse> {
  const message: DetailRequest = { type: DETAIL_CHANNEL, ean };
  try {
    const response = (await chrome.runtime.sendMessage(message)) as DetailResponse | undefined;
    return response ?? { status: 'error', detail: null };
  } catch (err) {
    console.warn(`[Nitide] detail rpc failed for ${ean}`, err);
    return { status: 'error', detail: null };
  }
}

/**
 * Called on boot and on every SPA navigation. Idempotent per EAN: re-injects the
 * panel only when the product changes.
 */
export function syncPdpPanel(): void {
  // 1. Same product as last sync? Nothing to do.
  const ean = extractPdpEan(location.href);
  if (ean === currentEan) return;
  currentEan = ean;

  // 2. Show the loading panel on the current product page (or nothing elsewhere).
  const slot = ean ? findSlot() : null;
  if (slot) {
    clearAllPanels(); // drop any panel left on a previous slot
    renderPanel(slot, { kind: 'loading' });
  }
  if (!ean || !slot) return;

  // 3. Fetch the detail, then fill the panel, unless we've navigated away since.
  const requestedEan = ean;
  void requestDetail(requestedEan).then((res) => {
    if (currentEan !== requestedEan) return;

    const live = findSlot();
    if (!live) return;

    if (res.status === 'found' && res.detail) {
      renderPanel(live, { kind: 'product', detail: res.detail });
    } else {
      removePanel(live);
    }
  });
}
