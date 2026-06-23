// Word-image routes (mounted at /api/word-image). Public — guests get images
// too. Looks up a free illustrative photo for a vocabulary word via Jisho
// (JA→EN) + Pixabay; the Pixabay key stays server-side. SQL-free: pure parsing
// lives in wordImage.ts, the network calls in wordImageStore.
import { Router } from "express";
import { wrap } from "../../core/middleware.js";
import * as wordImageStore from "./wordImageStore.js";

export const wordImageRoutes = Router();

wordImageRoutes.get(
  "/",
  wrap(async (req, res) => {
    // Not configured → 503 (retryable) rather than a definitive "no image",
    // so the client doesn't permanently mark every word as image-less.
    if (!wordImageStore.isConfigured()) {
      return res.status(503).json({ error: "Tính năng ảnh chưa được cấu hình" });
    }
    const term = String(req.query.term ?? "").trim();
    const lang = String(req.query.lang ?? "");
    if (!term) return res.json(null);
    res.json(await wordImageStore.findImage(term, lang));
  }),
);
