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
 *    own records (session log, progress, settings) and are always fetched;
 *  - the CMS panel (/admin, docs/cms/SETUP.md) is never touched at all: its
 *    pages carry the editors' work behind two locks, and a copy in this
 *    cache would sit outside both.
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
// The app shell's routes are static (cluster H: the screens render from the
// client store), so they are precached and a navigation to any of them is
// answered from the cache first — instant, and available offline.
const SHELL_ROUTES = ["/home", "/lessons", "/practice", "/rewards", "/progress", "/parent", "/session/summary"];
// Every app route is a static shell (cluster H): these, plus the parametrised and nested ones, are served cache-first once seen.
const SHELL_ROUTE_RE = /^\/(home|lessons(\/\d+)?|practice|rewards(\/certificate)?|progress|session(\/summary)?|parent(\/(settings|pin|delete|profiles|report|subscription))?)\/?$/u;
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", ...SHELL_ROUTES];

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

// Payload's panel: everything under /admin except the app's own QA galleries
// (src/cms/routes.ts APP_ADMIN_PAGES — src/lib/cmsGate.test.ts keeps the two lists equal).
const APP_ADMIN_PAGES = ["/admin/board-gallery", "/admin/design-gallery", "/admin/design-preview"];
const isCmsPanel = (url) =>
  url.origin === self.location.origin &&
  (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) &&
  !APP_ADMIN_PAGES.some((page) => url.pathname === page || url.pathname.startsWith(`${page}/`));
const isClip = (url) => url.origin === self.location.origin && /^\/api\/clip\/[0-9a-f]+$/u.test(url.pathname);
const isStatic = (url) => url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest");

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // The CMS panel: straight to the network, never cached, never answered from a cache.
  if (isCmsPanel(url)) return;

  if (request.mode === "navigate") {
    // The app shell's own routes are static: answer from the cache at once
    // and refresh the copy behind (stale-while-revalidate). Everything else
    // stays network-first with the cache behind it, the offline page last.
    const shellRoute = url.origin === self.location.origin && (SHELL_ROUTES.includes(url.pathname) || SHELL_ROUTE_RE.test(url.pathname));
    if (shellRoute) {
      event.respondWith(
        caches.open(SHELL).then((cache) =>
          cache.match(request).then((hit) => {
            const refresh = fetch(request)
              .then((response) => {
                if (response.ok) cache.put(request, response.clone());
                return response;
              })
              .catch(() => hit || caches.match(OFFLINE_URL));
            return hit || refresh;
          }),
        ),
      );
      return;
    }
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

  // A client-side transition fetches the route's payload (the RSC stream,
  // `?_rsc=`): the same stale-while-revalidate as the shell, so a tap on a
  // slow or absent network still transitions instead of falling back to a
  // full page load.
  if (url.origin === self.location.origin && (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) && SHELL_ROUTE_RE.test(url.pathname)) {
    event.respondWith(
      caches.open(SHELL).then((cache) =>
        cache.match(request).then((hit) => {
          const refresh = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => hit || Response.error());
          return hit || refresh;
        }),
      ),
    );
    return;
  }

  // The packed lesson script is content, not the child's records: cached on
  // first load and refreshed behind, so a sitting can start at once (and
  // offline). Its cache key ignores nothing — the route is deterministic per child.
  if (url.origin === self.location.origin && url.pathname === "/api/lesson-script") {
    event.respondWith(
      caches.open(CLIPS).then((cache) =>
        cache.match(request).then((hit) => {
          const refresh = fetch(request)
            .then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => hit);
          return hit || refresh;
        }),
      ),
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
