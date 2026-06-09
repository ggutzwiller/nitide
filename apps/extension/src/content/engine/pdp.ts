// Product-detail-page (PDP) integration: detect a product page, extract its
// EAN, and drive the detailed panel (loading -> filled / removed). The retailer
// supplies the URL->EAN parsing and the slot lookup; everything else (the OFF
// lookup over DETAIL_CHANNEL, the loading/filled lifecycle) is generic.
import { renderPanel, removePanel, PANEL_HOST_CLASS } from './panel.tsx';
import type { RetailerPdp } from './types.ts';
import { DETAIL_CHANNEL, type DetailRequest, type DetailResponse } from '../../shared/messages.ts';

let currentEan: string | null = null;

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
export function syncPanel(pdp: RetailerPdp): void {
  // 1. Same product as last sync? Nothing to do.
  const ean = pdp.extractEan(location.href);
  if (ean === currentEan) return;
  currentEan = ean;

  // 2. Show the loading panel on the current product page (or nothing elsewhere).
  const slot = ean ? pdp.findPanelSlot() : null;
  if (slot) {
    clearAllPanels(); // drop any panel left on a previous slot
    renderPanel(slot, { kind: 'loading' });
  }
  if (!ean || !slot) return;

  // 3. Fetch the detail, then fill the panel, unless we've navigated away since.
  const requestedEan = ean;
  void requestDetail(requestedEan).then((res) => {
    if (currentEan !== requestedEan) return;

    const live = pdp.findPanelSlot();
    if (!live) return;

    if (res.status === 'found' && res.detail) {
      renderPanel(live, { kind: 'product', detail: res.detail });
    } else {
      removePanel(live);
    }
  });
}
