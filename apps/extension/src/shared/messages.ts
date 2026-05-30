// Message contract between the Carrefour content script and the background
// service worker. Keep this file dependency-free beyond `@nitide/core` types
// so both sides import it without pulling unrelated code.

import type { MatchInput, Product, ProductDetail } from '@nitide/core';

export const MATCH_CHANNEL = 'nitide:match';

export interface MatchRequest {
  type: typeof MATCH_CHANNEL;
  input: MatchInput;
}

export interface MatchResponse {
  product: Product | null;
}

export function isMatchRequest(message: unknown): message is MatchRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === MATCH_CHANNEL
  );
}

// --- Product detail (PDP) channel: a single live OFF lookup per product page ---

export const DETAIL_CHANNEL = 'nitide:detail';

export type DetailStatus = 'found' | 'not-found' | 'error';

export interface DetailRequest {
  type: typeof DETAIL_CHANNEL;
  ean: string;
}

export interface DetailResponse {
  status: DetailStatus;
  detail: ProductDetail | null;
}

export function isDetailRequest(message: unknown): message is DetailRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === DETAIL_CHANNEL &&
    typeof (message as { ean?: unknown }).ean === 'string'
  );
}
