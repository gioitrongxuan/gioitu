/// <reference types="vitest/config" />
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { collectBuildAssets, injectBuildAssets } from "./src/app/swPrecache";

// public/sw.js được copy nguyên trạng vào dist (không qua pipeline bundle) nên
// không tự biết tên các chunk có hash. Plugin này gom danh sách asset ở
// generateBundle rồi — khi mọi thứ đã nằm trên đĩa (closeBundle chạy sau bước
// copy public/) — chèn vào placeholder trong dist/sw.js, để SW precache được
// cả chunk lazy và biết hash nào là rác của deploy cũ mà dọn. Logic thuần (đã
// có test) ở src/app/swPrecache.ts.
function swPrecache(): Plugin {
  let assets: string[] = [];
  let swDistFile = "";
  return {
    name: "gioitu:sw-precache",
    apply: "build",
    configResolved(config) {
      swDistFile = resolve(config.root, config.build.outDir, "sw.js");
    },
    generateBundle(_options, bundle) {
      assets = collectBuildAssets(Object.keys(bundle));
    },
    async closeBundle() {
      // Build lỗi thì generateBundle không chạy → không có gì để chèn.
      if (assets.length === 0) return;
      const source = await readFile(swDistFile, "utf8");
      await writeFile(swDistFile, injectBuildAssets(source, assets));
    },
  };
}

// Vite + Vitest configuration.
// The frontend talks to the optional backend (see /server) through /api, which
// is proxied to the Express server during development. The target is overridable
// via VITE_PROXY_TARGET so the dev container can point /api at the `api` service
// (see docker-compose.dev.yml) instead of localhost.
export default defineConfig({
  plugins: [react(), swPrecache()],
  // Import aliases (also honoured by Vitest): "@" → src, "@server" → server/src.
  // Cross-feature / shared imports use these; intra-feature imports stay relative.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@server": fileURLToPath(new URL("./server/src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
