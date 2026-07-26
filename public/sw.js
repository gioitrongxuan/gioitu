// Service worker: app-shell offline. Dữ liệu học/từ điển local đã nằm trong
// IndexedDB nên chỉ cần cache vỏ app (HTML + asset build + icon) là bản cài
// từ màn hình chính mở được không mạng. Chiến lược:
//   • điều hướng  → network-first (bản deploy mới luôn thắng), offline rơi về
//     shell đã cache;
//   • asset build → cache-first (tên file có hash, bất biến), precache đủ cả
//     chunk lazy lúc install, dọn hash cũ lúc activate;
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

// Danh sách MỌI asset của build hiện hành — kể cả chunk lazy (Bộ thủ, Kanji,
// skin…) không xuất hiện trong index.html. Plugin sw-precache (vite.config.ts,
// logic ở src/app/swPrecache.ts) thay placeholder bằng mảng JSON lúc build;
// hash đổi ⇒ byte sw.js đổi ⇒ trình duyệt cài lại SW, nên install/activate
// chạy lại mỗi deploy dù VERSION đứng yên. Ở dev placeholder còn nguyên
// (chuỗi) → coi như rỗng.
const BUILD_ASSETS = "__SW_BUILD_ASSETS__";
const buildAssets = Array.isArray(BUILD_ASSETS) ? BUILD_ASSETS : [];

// Lần đầu cài, trang đang mở CHƯA bị SW kiểm soát nên asset của nó không đi
// qua fetch handler — phải precache chủ động. Nguồn: BUILD_ASSETS (đủ cả chunk
// lazy, để offline lần đầu vẫn mở được màn phụ) + quét index.html vừa cache
// (lưới an toàn khi placeholder chưa được chèn). Chỉ tải phần còn thiếu: giữa
// hai deploy phần lớn chunk giữ nguyên hash, addAll cả danh sách sẽ tải lại
// toàn bộ vô ích.
async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  await shell.addAll(SHELL);
  const index = await shell.match("/");
  const html = await index.text();
  const fromHtml = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const assets = [...new Set([...fromHtml, ...buildAssets])];
  const assetCache = await caches.open(ASSET_CACHE);
  const missing = [];
  for (const path of assets) {
    if (!(await assetCache.match(path, { ignoreVary: true }))) missing.push(path);
  }
  await assetCache.addAll(missing);
}

// VERSION giữ "v1" qua các deploy nên nhánh dọn-theo-tên-cache ở activate
// không đụng tới ASSET_CACHE hiện hành — hash cũ cứ thế tích luỹ. Dọn theo
// nội dung: entry dưới /assets/ (tên có hash, bất biến) mà không còn trong
// build hiện hành chắc chắn là rác deploy cũ. File ngoài /assets/ được
// runtime-cache thì không đủ căn cứ phán, để nguyên. Không có BUILD_ASSETS
// (dev/chưa chèn) thì đứng yên — thiếu danh sách chuẩn thì đừng xoá bậy.
async function pruneStaleAssets() {
  if (buildAssets.length === 0) return;
  const keep = new Set(buildAssets);
  const assetCache = await caches.open(ASSET_CACHE);
  const cached = await assetCache.keys();
  const stale = cached.filter((request) => {
    const path = new URL(request.url).pathname;
    return path.startsWith("/assets/") && !keep.has(path);
  });
  await Promise.all(stale.map((request) => assetCache.delete(request)));
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
      .then(pruneStaleAssets)
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
