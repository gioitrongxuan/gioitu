// Word-image routes (mounted at /api/word-image). Public — guests get images
// too. Returns several candidate photos for a vocabulary word (Jisho JA→EN +
// Vietnamese meaning + the term, all searched on Pixabay) for the client to vote
// on. The Pixabay key stays server-side; pure assembly lives in wordImage.ts.
import { Router } from "express";
import { wrap } from "../../core/middleware.js";
import * as wordImageStore from "./wordImageStore.js";

export const wordImageRoutes = Router();

wordImageRoutes.get(
  "/",
  wrap(async (req, res) => {
    // Not configured → 503 (retryable) rather than a definitive "no images",
    // so the client doesn't permanently mark every word as image-less.
    if (!wordImageStore.isConfigured()) {
      return res.status(503).json({ error: "Tính năng ảnh chưa được cấu hình" });
    }
    const term = String(req.query.term ?? "").trim();
    const lang = String(req.query.lang ?? "");
    const nativeMeaning = String(req.query.vi ?? ""); // the word's Vietnamese meaning
    if (!term) return res.json({ candidates: [] });
    res.json({ candidates: await wordImageStore.findCandidates(term, lang, nativeMeaning) });
  }),
);
