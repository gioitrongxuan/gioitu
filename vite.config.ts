/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite + Vitest configuration.
// The frontend talks to the optional backend (see /server) through /api, which
// is proxied to the Express server during development. The target is overridable
// via VITE_PROXY_TARGET so the dev container can point /api at the `api` service
// (see docker-compose.dev.yml) instead of localhost.
export default defineConfig({
  plugins: [react()],
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
    include: ["test/**/*.test.ts"],
  },
});
