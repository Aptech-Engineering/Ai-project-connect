/**
 * The student pass, kept on the phone.
 *
 * At a gate the line is often bad, so the page itself is served from a cache and the
 * status is fetched over the network. If the network fails the page still opens and
 * shows the last answer it saved, clearly marked as old — never a stale "CLEARED"
 * pretending to be live.
 *
 * It claims nothing outside /student/, so the rest of the site is never cached and a
 * deploy is never stale.
 */
const CACHE = "student-pass-v1";
const SHELL = "/student/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([SHELL, "/student/", "/manifest.webmanifest"])).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // The status itself is never served from a cache: the page handles being offline.
  if (url.pathname.startsWith("/api/")) return;

  const wanted = url.pathname.startsWith("/student") || url.pathname.startsWith("/_next/") || url.pathname.endsWith(".png") || url.pathname.endsWith(".webp") || url.pathname === "/manifest.webmanifest";
  if (!wanted) return;

  // Fresh when there is a line, cached when there is not.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(async () => (await caches.match(event.request)) ?? (await caches.match(SHELL)) ?? Response.error()),
  );
});
