// Express app assembly: middleware, feature routers, and (in production) the
// built frontend. Kept separate from index.ts so the app can be constructed
// without starting a listener.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express from "express";
import cors from "cors";
import { authRoutes } from "./features/auth/authRoutes.js";
import { dictRoutes } from "./features/dictionary/dictRoutes.js";
import { syncRoutes } from "./features/sync/syncRoutes.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  // Feature routers (each owns its sub-paths).
  app.use("/api/auth", authRoutes);
  app.use("/api/dict", dictRoutes);
  app.use("/api/sync", syncRoutes);

  // --- Serve the built frontend (production / Docker) ---
  // When a `dist/` bundle exists (or GIOITU_STATIC_DIR points at one), the same
  // process serves the SPA so the app is reachable on a single origin and the
  // `/api` calls need no proxy. In dev you instead run Vite, which proxies /api.
  const staticDir = resolve(process.env.GIOITU_STATIC_DIR ?? join(process.cwd(), "dist"));
  if (existsSync(join(staticDir, "index.html"))) {
    app.use(express.static(staticDir));
    // SPA fallback for any non-/api GET (client-side routing / refresh).
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(staticDir, "index.html")));
    console.log(`Serving frontend from ${staticDir}`);
  }

  return app;
}
