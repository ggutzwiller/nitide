// Service worker entry. Listens for match requests from content scripts and
// answers them from the bundled scores dataset.
//
// Why the message dance at all? An MV3 extension runs in two isolated worlds:
// the content script (sees the Carrefour DOM) and this service worker (loads
// the bundled dataset). They share no memory, so the content script asks via
// `chrome.runtime.sendMessage` and we reply through `sendResponse`.
import { createMatcher, type Matcher } from './matcher.ts';
import { loadBundledDataset } from './dataset.ts';
import { isMatchRequest, type MatchResponse } from '../shared/messages.ts';

// The dataset loads asynchronously (fetch + gunzip), but the onMessage listener
// below MUST be registered synchronously on the first tick (an MV3 rule — else
// messages arriving during wake-up are dropped). So we register now and build
// the matcher lazily, once, when the dataset resolves.
const datasetPromise = loadBundledDataset();
let matcherPromise: Promise<Matcher> | undefined;

function getMatcher(): Promise<Matcher> {
  if (!matcherPromise) {
    matcherPromise = datasetPromise.then((dataset) => createMatcher(dataset));
  }
  return matcherPromise;
}

chrome.runtime.onInstalled.addListener((details) => {
  console.info('[Nitide] service worker installed', details.reason);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Not our message → return false so other listeners can handle it.
  if (!isMatchRequest(message)) return false;

  const label = message.input.ean ?? message.input.name;
  getMatcher()
    .then((matcher) => {
      const product = matcher.match(message.input);
      console.info(`[Nitide] match ${label}: ${product ? 'found' : 'not-found'}`);
      sendResponse({ product } satisfies MatchResponse);
    })
    .catch((err) => {
      console.error(`[Nitide] match ${label}: error`, err);
      sendResponse({ product: null } satisfies MatchResponse);
    });

  // We call sendResponse asynchronously → keep the message channel open.
  return true;
});
