import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  SW_BUILD_ASSETS_PLACEHOLDER,
  collectBuildAssets,
  injectBuildAssets,
} from "@/app/swPrecache";

const SW_SOURCE = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://gioitu.test";
// Trùng hằng số trong sw.js (VERSION "v1").
const ASSET_CACHE = "gioitu-assets-v1";

// ---------------------------------------------------------------------------
// Logic thuần phía build (vite.config.ts dùng qua plugin sw-precache)
// ---------------------------------------------------------------------------

describe("collectBuildAssets", () => {
  it("chỉ lấy assets/* (kể cả chunk lazy), tiền tố /, sắp xếp ổn định", () => {
    expect(
      collectBuildAssets([
        "index.html",
        "assets/radkfile-def456.js",
        "assets/index-abc123.js",
        "assets/index-abc123.css",
      ]),
    ).toEqual(["/assets/index-abc123.css", "/assets/index-abc123.js", "/assets/radkfile-def456.js"]);
  });

  it("bỏ sourcemap và file ngoài assets/ (sw.js, icon…)", () => {
    expect(
      collectBuildAssets(["assets/index-abc123.js.map", "sw.js", "icons/icon-192.png"]),
    ).toEqual([]);
  });
});

describe("injectBuildAssets", () => {
  it("thay placeholder bằng mảng JSON", () => {
    const out = injectBuildAssets(
      `const BUILD_ASSETS = ${SW_BUILD_ASSETS_PLACEHOLDER};`,
      ["/assets/a.js"],
    );
    expect(out).toBe('const BUILD_ASSETS = ["/assets/a.js"];');
  });

  it("thiếu placeholder → ném lỗi (build phải fail to tiếng)", () => {
    expect(() => injectBuildAssets("const BUILD_ASSETS = [];", [])).toThrow(/placeholder/);
  });

  it("public/sw.js thật vẫn chứa placeholder", () => {
    expect(SW_SOURCE).toContain(SW_BUILD_ASSETS_PLACEHOLDER);
  });
});

// ---------------------------------------------------------------------------
// Hành vi install/activate của public/sw.js — chạy nguồn thật trong vm với
// CacheStorage + fetch giả để kiểm chứng precache chunk lazy và dọn hash cũ.
// ---------------------------------------------------------------------------

const toHref = (pathOrUrl: string) => new URL(pathOrUrl, ORIGIN).href;

type RequestLike = string | { url: string };
const requestHref = (request: RequestLike) =>
  toHref(typeof request === "string" ? request : request.url);

// Cache tối giản: chỉ những API sw.js đụng tới; body lưu dạng chuỗi.
class FakeCache {
  private store = new Map<string, string>();

  constructor(private fetchImpl: (path: string) => Promise<Response>) {}

  async addAll(paths: string[]) {
    for (const path of paths) {
      const response = await this.fetchImpl(path);
      // Bám semantics của Cache.addAll thật: một response lỗi làm cả lô fail.
      if (!response.ok) throw new Error(`addAll: ${path} → ${response.status}`);
      this.store.set(toHref(path), await response.text());
    }
  }

  async match(request: RequestLike, _options?: unknown) {
    const body = this.store.get(requestHref(request));
    return body === undefined ? undefined : new Response(body);
  }

  async put(request: RequestLike, response: Response) {
    this.store.set(requestHref(request), await response.text());
  }

  async keys() {
    return [...this.store.keys()].map((href) => ({ url: href }));
  }

  async delete(request: RequestLike) {
    return this.store.delete(requestHref(request));
  }

  cachedPaths() {
    return [...this.store.keys()].map((href) => new URL(href).pathname).sort();
  }
}

class FakeCacheStorage {
  fetchImpl: (path: string) => Promise<Response> = () => {
    throw new Error("fetchImpl chưa được gắn");
  };
  private byName = new Map<string, FakeCache>();

  async open(name: string) {
    let cache = this.byName.get(name);
    if (!cache) {
      cache = new FakeCache((path) => this.fetchImpl(path));
      this.byName.set(name, cache);
    }
    return cache;
  }

  async keys() {
    return [...this.byName.keys()];
  }

  async delete(name: string) {
    return this.byName.delete(name);
  }

  async match(request: RequestLike, _options?: unknown) {
    for (const cache of this.byName.values()) {
      const hit = await cache.match(request);
      if (hit) return hit;
    }
    return undefined;
  }

  peek(name: string) {
    return this.byName.get(name);
  }
}

/**
 * Nạp nguồn sw.js vào vm với môi trường SW giả. `routes` là "server": path →
 * body; path vắng mặt trả 404. Trả về cách phát install/activate (chờ trọn
 * waitUntil) + danh sách path đã fetch để soi cái gì bị tải lại.
 */
function bootServiceWorker(swSource: string, routes: Map<string, string>, cacheStorage: FakeCacheStorage) {
  const fetched: string[] = [];
  const fetchStub = async (input: RequestLike) => {
    const pathname = new URL(requestHref(input)).pathname;
    fetched.push(pathname);
    const body = routes.get(pathname);
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body);
  };
  cacheStorage.fetchImpl = fetchStub;

  const listeners = new Map<string, (event: unknown) => void>();
  const swSelf = {
    addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  runInNewContext(swSource, {
    self: swSelf,
    caches: cacheStorage,
    fetch: fetchStub,
    location: new URL(`${ORIGIN}/`),
    URL,
    Response,
  });

  const dispatch = async (type: string) => {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  };
  return { install: () => dispatch("install"), activate: () => dispatch("activate"), fetched };
}

// "Server" của một bản deploy: index.html chỉ tham chiếu chunk vào; chunk lazy
// (radkfile) chỉ nằm trong BUILD_ASSETS.
function deployRoutes(tag: string, lazyChunk: string) {
  return new Map([
    ["/", `<script src="/assets/index-${tag}.js"></script><link href="/assets/index-${tag}.css">`],
    ["/manifest.webmanifest", "{}"],
    ["/icons/icon-192.png", "png"],
    ["/icons/icon-512.png", "png"],
    ["/icons/maskable-512.png", "png"],
    ["/icons/apple-touch-icon.png", "png"],
    [`/assets/index-${tag}.js`, `js-${tag}`],
    [`/assets/index-${tag}.css`, `css-${tag}`],
    [lazyChunk, "lazy"],
  ]);
}

const LAZY_CHUNK = "/assets/radkfile-aaa.js";
const deploy1 = {
  routes: deployRoutes("aaa", LAZY_CHUNK),
  assets: ["/assets/index-aaa.css", "/assets/index-aaa.js", LAZY_CHUNK],
};
// Deploy sau: chunk vào đổi hash, chunk lazy giữ nguyên (nội dung không đổi).
const deploy2 = {
  routes: deployRoutes("bbb", LAZY_CHUNK),
  assets: ["/assets/index-bbb.css", "/assets/index-bbb.js", LAZY_CHUNK],
};

describe("sw.js install — precache", () => {
  it("precache cả chunk lazy không xuất hiện trong index.html", async () => {
    const caches = new FakeCacheStorage();
    const sw = bootServiceWorker(injectBuildAssets(SW_SOURCE, deploy1.assets), deploy1.routes, caches);
    await sw.install();
    expect(caches.peek(ASSET_CACHE)!.cachedPaths()).toEqual(deploy1.assets);
  });

  it("placeholder chưa chèn (dev) → vẫn cài được, precache theo quét HTML", async () => {
    const caches = new FakeCacheStorage();
    const sw = bootServiceWorker(SW_SOURCE, deploy1.routes, caches);
    await sw.install();
    // Không có danh sách build thì chunk lazy đành chịu, nhưng install không vỡ.
    expect(caches.peek(ASSET_CACHE)!.cachedPaths()).toEqual([
      "/assets/index-aaa.css",
      "/assets/index-aaa.js",
    ]);
  });

  it("deploy mới không tải lại chunk giữ nguyên hash", async () => {
    const caches = new FakeCacheStorage();
    await bootServiceWorker(injectBuildAssets(SW_SOURCE, deploy1.assets), deploy1.routes, caches).install();

    const sw2 = bootServiceWorker(injectBuildAssets(SW_SOURCE, deploy2.assets), deploy2.routes, caches);
    await sw2.install();
    expect(sw2.fetched).not.toContain(LAZY_CHUNK);
    expect(sw2.fetched).toContain("/assets/index-bbb.js");
  });
});

describe("sw.js activate — dọn ASSET_CACHE cũ", () => {
  it("xoá hash không còn trong build, giữ chunk còn dùng và file ngoài /assets/", async () => {
    const caches = new FakeCacheStorage();
    await bootServiceWorker(injectBuildAssets(SW_SOURCE, deploy1.assets), deploy1.routes, caches).install();
    // File ngoài /assets/ lọt vào qua runtime-cache — prune không được đụng.
    await (await caches.open(ASSET_CACHE)).put("/searcharea.png", new Response("png"));

    const sw2 = bootServiceWorker(injectBuildAssets(SW_SOURCE, deploy2.assets), deploy2.routes, caches);
    await sw2.install();
    await sw2.activate();
    expect(caches.peek(ASSET_CACHE)!.cachedPaths()).toEqual([
      ...deploy2.assets,
      "/searcharea.png",
    ]);
  });

  it("không có danh sách build (dev) → không xoá gì dưới /assets/", async () => {
    const caches = new FakeCacheStorage();
    await (await caches.open(ASSET_CACHE)).put("/assets/index-cu-999.js", new Response("js"));

    const sw = bootServiceWorker(SW_SOURCE, deploy1.routes, caches);
    await sw.install();
    await sw.activate();
    expect(caches.peek(ASSET_CACHE)!.cachedPaths()).toContain("/assets/index-cu-999.js");
  });

  it("vẫn xoá nguyên cache mang VERSION cũ (hành vi sẵn có)", async () => {
    const caches = new FakeCacheStorage();
    await caches.open("gioitu-assets-v0");

    const sw = bootServiceWorker(injectBuildAssets(SW_SOURCE, deploy1.assets), deploy1.routes, caches);
    await sw.install();
    await sw.activate();
    expect(await caches.keys()).not.toContain("gioitu-assets-v0");
  });
});
