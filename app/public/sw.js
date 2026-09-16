/*
 * Serendib Scholar service worker (hand-rolled; no build step).
 *
 *  - app shell, tokens, fonts, the board primitives: /_next/static/* and
 *    /icons/* are cache-first (immutable, hashed), navigations are
 *    network-first with the cached copy behind them and the designed
 *    offline state as the last resort;
 *  - lesson clips (/api/clip/<key>, and their ?meta=1) are cached on first
 *    play and served from the cache after — lesson audio is content, not
 *    child data;
 *  - EVERY OTHER /api/* response is never cached: those carry the child's
 *    own records (session log, progress, settings) and are always fetched.
 */
// One cache generation per build: the registration URL carries the build's
// SHA (?v=…), so a new deploy installs a new worker with its own caches and
// the old ones are dropped on activate.
const BUILD = new URL(self.location.href).searchParams.get("v") || "dev";
const VERSION = `ss-v3-${BUILD}`;
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const CLIPS = `${VERSION}-clips`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];

// The offline page must render without the network on a device that has
// barely used the app: its own script and style chunks are precached with it
// (a fresh device that goes offline early otherwise hydrates it against
// missing chunks and lands on the error state instead).
async function precacheOfflineAssets() {
  const html = await fetch(OFFLINE_URL).then((r) => (r.ok ? r.text() : ""));
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]))];
  const cache = await caches.open(STATIC);
  await Promise.all(assets.map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => precacheOfflineAssets())
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isClip = (url) => url.origin === self.location.origin && /^\/api\/clip\/[0-9a-f]+$/u.test(url.pathname);
const isStatic = (url) => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest");

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.origin === self.location.origin && !url.pathname.startsWith("/api/")) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match(OFFLINE_URL))),
    );
    return;
  }

  if (isClip(url)) {
    event.respondWith(
      caches.open(CLIPS).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((response) => {
              if (response.ok && (response.type === "basic" || response.type === "cors")) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
    return;
  }

  if (url.pathname.startsWith("/api/")) return; // never cached: child data, or a signed door

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "ss:build") {
    event.source?.postMessage({ type: "ss:build", build: BUILD });
    return;
  }
  if (event.data === "ss:stats") {
    Promise.all([caches.open(CLIPS).then((c) => c.keys()), caches.open(STATIC).then((c) => c.keys()), caches.open(SHELL).then((c) => c.keys())]).then(([clips, statics, shell]) => {
      event.source?.postMessage({ type: "ss:stats", clips: clips.length, statics: statics.length, shell: shell.length });
    });
  }
});
