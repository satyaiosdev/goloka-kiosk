// Caches the kiosk so it still opens when event Wi-Fi drops.
// Bump VERSION after changing any file so iPads pick up the update.
const VERSION = "gk-v5";
const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "assets/logo.png", "manifest.webmanifest",
  "assets/photos/cow-1.jpg", "assets/photos/cow-2.jpg", "assets/photos/cow-3.jpg", "assets/photos/cow-4.jpg", "assets/photos/cow-5.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // submissions go straight to the network
  // Network first (so edits show up), cache as fallback when offline.
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
