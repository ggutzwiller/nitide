// Message contract between the Carrefour content script and the background
// service worker. Keep this file dependency-free beyond `@nitide/core` types
// so both sides import it without pulling unrelated code.

import type { MatchInput, Product } from '@nitide/core';

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
