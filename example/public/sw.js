/*
 * The service worker of the quran-libary mushaf (registered by src/main.tsx in a production build only).
 *
 * - The app's page: the network first, the last copy when offline, so a new deploy shows at once.
 * - The app's built files (assets/…, hashed names): from the device once kept.
 * - The mushaf's data (mushaf/pages/page-NNN.json, mushaf_index.json, chapters.json, search_text.json) and fonts
 *   (fonts/pages/pN.woff2, fonts/surah-header.woff2), on this origin or your files Worker: from the device once kept
 *   — a page that was read once opens with no request, also offline. They never change under their address (a new
 *   version goes into a new folder, v2/ …), so the copy is never refreshed.
 * - The reciters' audio is left to the network and the browser's own cache (Range requests).
 * - Requests with `cache: "force-cache"` come from the whole-mushaf download (src/mushaf/offline), which keeps its
 *   files itself.
 *
 * The cache names must match src/mushaf/offline/offlinePlan.ts and src/mushaf/utils/mushafFonts.ts.
 */
const APP_CACHE = "quran-libary-app";
const DATA_CACHE = "quran-libary-data-v1";
const FONTS_CACHE = "quran-libary-fonts-v1";
const TYPEFACE_CACHE = "quran-libary-typeface";
const CURRENT_CACHES = [APP_CACHE, DATA_CACHE, FONTS_CACHE, TYPEFACE_CACHE];
/** Built files kept at most: the oldest (earlier builds') go first */
const MAX_ASSETS = 120;

const SHELL = self.registration.scope;
const DATA_FILE = /\/mushaf\/(pages\/page-\d{3}\.json|mushaf_index\.json|chapters\.json|search_text\.json)$/;
const FONT_FILE = /\/fonts\/(pages\/p\d{1,3}\.woff2|surah-header\.woff2)$/;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.add(SHELL))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => undefined);
      }
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("quran-libary-") && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    if (url.origin === self.location.origin) event.respondWith(openPage(event));
    return;
  }
  if (request.cache === "force-cache" || request.headers.has("range")) return;

  if (DATA_FILE.test(url.pathname)) {
    event.respondWith(fromCache(event, DATA_CACHE));
  } else if (FONT_FILE.test(url.pathname)) {
    event.respondWith(fromCache(event, FONTS_CACHE));
  } else if (url.origin === self.location.origin && url.pathname.startsWith(new URL("assets/", SHELL).pathname)) {
    event.respondWith(fromCache(event, APP_CACHE, trimAssets));
  } else if (url.hostname === "fonts.gstatic.com") {
    event.respondWith(fromCache(event, TYPEFACE_CACHE));
  } else if (url.hostname === "fonts.googleapis.com") {
    event.respondWith(refreshed(event, TYPEFACE_CACHE));
  }
  // Everything else (the audio …) goes to the network untouched.
});

/** The app's page: the network first; without network, the last copy. */
async function openPage(event) {
  try {
    const response = (await event.preloadResponse) || (await fetch(event.request));
    if (response.ok && (response.headers.get("content-type") || "").includes("text/html")) {
      const copy = response.clone();
      event.waitUntil(
        caches
          .open(APP_CACHE)
          .then((cache) => cache.put(SHELL, copy))
          .catch(() => undefined),
      );
    }
    return response;
  } catch (error) {
    const kept = await caches.match(SHELL, { cacheName: APP_CACHE });
    if (kept) return kept;
    throw error;
  }
}

/** A file that never changes under its address: the kept copy, else the network (and kept for next time). */
async function fromCache(event, cacheName, afterPut) {
  const cache = await caches.open(cacheName);
  const kept = await cache.match(event.request, { ignoreVary: true });
  if (kept) return kept;

  const response = await fetch(event.request);
  if (response.ok) {
    const copy = response.clone();
    event.waitUntil(
      cache
        .put(event.request, copy)
        .then(() => afterPut && afterPut(cache))
        .catch(() => undefined),
    );
  }
  return response;
}

/** A file that may change under its address: the kept copy at once, refreshed from the network for next time. */
async function refreshed(event, cacheName) {
  const cache = await caches.open(cacheName);
  const kept = await cache.match(event.request, { ignoreVary: true });
  const fresh = fetch(event.request).then((response) => {
    // Google's stylesheet comes from a CSS @import: an opaque answer, kept as it is
    if (response.ok || response.type === "opaque") {
      const copy = response.clone();
      return cache.put(event.request, copy).then(() => response);
    }
    return response;
  });
  event.waitUntil(fresh.catch(() => undefined));
  return kept || fresh;
}

async function trimAssets(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((request) => new URL(request.url).pathname.includes("/assets/"));
  for (const request of assets.slice(0, Math.max(0, assets.length - MAX_ASSETS))) await cache.delete(request);
}
