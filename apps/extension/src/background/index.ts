// Service worker entry. Listens for match requests from content scripts and
// proxies them through the shared matcher. The worker origin (chrome-extension://)
// combined with host_permissions lets us fetch openfoodfacts.org without CORS
// preflights — content scripts share the page origin and cannot.
import { createChromeLocalStorage } from '@nitide/core';
import { createMatcher } from './matcher.ts';
import { isMatchRequest, type MatchResponse } from '../shared/messages.ts';

const matcher = createMatcher({ storage: createChromeLocalStorage() });

chrome.runtime.onInstalled.addListener((details) => {
  console.info('[Nitide] service worker installed', details.reason);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isMatchRequest(message)) return false;

  const ean = message.input.ean ?? `text:${message.input.name}`;
  matcher
    .match(message.input)
    .then((product) => {
      console.info(
        `[Nitide] worker match ${ean}: ${product ? 'found' : 'not-found'}`,
        product
          ? { nutri: product.nutriScore, green: product.greenScore, nova: product.nova }
          : undefined,
      );
      const response: MatchResponse = { product };
      sendResponse(response);
    })
    .catch((err) => {
      console.error(`[Nitide] worker match ${ean}: error`, err);
      sendResponse({ product: null } satisfies MatchResponse);
    });

  // Tell Chrome we'll call sendResponse asynchronously.
  return true;
});
