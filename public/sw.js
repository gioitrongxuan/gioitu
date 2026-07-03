// Service worker: app-shell offline. Dữ liệu học/từ điển local đã nằm trong
// IndexedDB nên chỉ cần cache vỏ app (HTML + asset build + icon) là bản cài
// từ màn hình chính mở được không mạng. Chiến lược:
//   • điều hướng  → network-first (bản deploy mới luôn thắng), offline rơi về
//     shell đã cache;
//   • asset build → cache-first (tên file có hash, bất biến);
//   • /api/*      → không đụng (dữ liệu động, kèm auth);
//   • cross-origin (ảnh Mazii, KanjiVG…) → không đụng, trình duyệt tự lo.
// Đổi VERSION khi cần xoá sạch cache cũ ở activate.

const VERSION = "v1";
const SHELL_CACHE = `gioitu-shell-${VERSION}`;
const ASSET_CACHE = `gioitu-assets-${VERSION}`;
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

// Lần đầu cài, trang đang mở CHƯA bị SW kiểm soát nên asset của nó không đi
// qua fetch handler — phải precache chủ động: đọc index.html vừa cache, nhặt
// mọi đường dẫn /assets/* (tên file có hash) và nạp trước. Deploy mới không
// đổi sw.js vẫn ổn: navigate network-first cập nhật "/", asset mới được
// runtime-cache khi trang (đã bị kiểm soát) tải chúng.
async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  await shell.addAll(SHELL);
  const index = await shell.match("/");
  const html = await index.text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
  const assetCache = await caches.open(ASSET_CACHE);
  await assetCache.addAll(assets);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // SPA một trang: mọi điều hướng đều là index → cache dưới khoá "/".
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/", { ignoreVary: true })),
    );
    return;
  }

  event.respondWith(
    // ignoreVary: server có thể trả `Vary: Origin`, mà request lúc precache
    // (không Origin) khác request của <script crossorigin> (có Origin) —
    // để nguyên thì match trượt dù asset nằm sẵn trong cache. Chỉ cache GET
    // same-origin nên bỏ qua Vary là an toàn.
    caches.match(request, { ignoreVary: true }).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
