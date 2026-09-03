/// <reference lib="webworker" />
/**
 * The service worker.
 *
 * The whole app shell is precached, including the SQLite WASM binary and the
 * fonts, because "works fully offline after first load" is the product. There
 * is no runtime caching of anything else: this app makes no network requests
 * once it is loaded. The only URLs it ever opens are wa.me links, which the
 * user taps deliberately and which leave the app entirely.
 */

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// Take control on the very first load, so the app is offline-capable after one
// visit rather than two. Deliberately not skipWaiting(): an *update* stays in
// waiting until the next cold launch, so a new worker can never swap chunks
// underneath a shopkeeper who is halfway through a sale.
clientsClaim();

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Single-page app: every navigation resolves to index.html from the precache,
// so deep links work offline and on any static host without a rewrite rule.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /\.[a-z0-9]+$/i],
  }),
);
