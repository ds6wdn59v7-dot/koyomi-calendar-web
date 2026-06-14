/* sw.js — オフラインキャッシュ（静的アプリなので cache-first） */
const CACHE = "koyomi-v42";
const ASSETS = ["./", "./index.html", "./app.js?v=42", "./koyomi.js?v=42", "./manifest.webmanifest", "./icon.svg", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  // Google API等の外部リクエストとGET以外はキャッシュ対象外（常にネットワークへ）
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }))
  );
});
