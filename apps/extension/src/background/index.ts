// Background service worker (MV3). Empty shell for now; M2 will wire the OFF cache.
chrome.runtime.onInstalled.addListener((details) => {
  console.info('[Nitide] service worker installed', details.reason);
});
