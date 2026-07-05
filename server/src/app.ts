// Express app assembly: middleware, feature routers, and (in production) the
// built frontend. Kept separate from index.ts so the app can be constructed
// without starting a listener.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express from "express";
import cors from "cors";
import { authRoutes } from "./features/auth/authRoutes.js";
import { dictRoutes } from "./features/dictionary/dictRoutes.js";
import { kanjiRoutes } from "./features/dictionary/kanjiRoutes.js";
import { handwritingRoutes } from "./features/dictionary/handwritingRoutes.js";
import { syncRoutes } from "./features/sync/syncRoutes.js";
import { studyListRoutes } from "./features/studylist/studyListRoutes.js";
import { ankiConnectRoutes, ankiRoutes } from "./features/anki/ankiRoutes.js";
import { aiRoutes } from "./features/ai/aiRoutes.js";
import { premiumRoutes } from "./features/premium/premiumRoutes.js";
import { dictSyncRoutes } from "./features/dictsync/dictSyncRoutes.js";

export function createApp() {
  const app = express();
  app.use(cors());
  // Body có thể lớn: đẩy toàn bộ từ điển cá nhân (JSON chưa nén) lên /api/dict-sync.
  app.use(express.json({ limit: "20mb" }));

  // Feature routers (each owns its sub-paths).
  app.use("/api/auth", authRoutes);
  app.use("/api/dict", dictRoutes);
  app.use("/api/kanji", kanjiRoutes);
  app.use("/api/handwriting", handwritingRoutes);
  app.use("/api/sync", syncRoutes);
  app.use("/api/studylist", studyListRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api/premium", premiumRoutes);
  app.use("/api/dict-sync", dictSyncRoutes);
  // Fake AnkiConnect server for Yomitan's "+" (saves into the user's SRS list).
  app.use("/api/yomitan-sync", ankiRoutes);
  // Same fake AnkiConnect server, but replies wrapped in the real AnkiConnect
  // `{ result, error }` envelope for standards-compliant clients (see
  // ankiRoutes.ts for why Yomitan can't use this same envelope).
  app.use("/api/anki-sync", ankiConnectRoutes);

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
