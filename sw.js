// 出勤簿のオフライン対応用 Service Worker。
// アプリ本体(HTML/CSS/JS/アイコン)をキャッシュし、電波が無い場所でも開けるようにする。
// 入力データ自体はキャッシュではなく localStorage に保存される(このファイルの役目ではない)。

// ファイルを更新したら、この番号を上げてください。上げないと、古いキャッシュが使われ続けます。
const CACHE_VERSION = "v6";
const CACHE_NAME = `kintai-shell-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "cloud.js",
  "cloud-config.js",
  "manifest.json",
  "vendor/react.production.min.js",
  "vendor/react-dom.production.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // ブラウザのHTTPキャッシュ(GitHub Pagesは約10分)を通さず、常に最新のファイルを取り込む
      .then((cache) => Promise.all(PRECACHE_URLS.map((u) => cache.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Googleフォント等の外部リクエストはそのまま通す

  if (req.mode === "navigate") {
    // ページ本体はネットワーク優先(更新をすぐ反映)。オフライン時はキャッシュ済みのindex.htmlを返す。
    event.respondWith(
      fetch(req).catch(() => caches.match("index.html"))
    );
    return;
  }

  // それ以外の同一オリジンの静的ファイルはキャッシュ優先、無ければネットワークから取得してキャッシュへ追加
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
