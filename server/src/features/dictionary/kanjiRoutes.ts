// Kanji routes (mounted at /api/kanji). Công khai — chỉ đọc. Cặp ngôn ngữ qua
// ?src=&tgt= (mặc định ja→vi). Handler mỏng; SQL ở kanjiStore.
import { Router } from "express";
import { wrap } from "../../core/middleware.js";
import * as kanjiStore from "./kanjiStore.js";

export const kanjiRoutes = Router();

// Nhiều kanji theo ?chars= (phân tích chữ của một từ) → KanjiEntry[], không kèm ví dụ.
kanjiRoutes.get(
  "/",
  wrap(async (req, res) => {
    const chars = String(req.query.chars ?? "");
    const src = String(req.query.src ?? "ja");
    const tgt = String(req.query.tgt ?? "vi");
    res.json(await kanjiStore.lookupKanjiMany(kanjiStore.kanjiCharsOf(chars), src, tgt));
  }),
);

// Một kanji → { kanji, examples }.
kanjiRoutes.get(
  "/:literal",
  wrap(async (req, res) => {
    const literal = String(req.params.literal);
    const src = String(req.query.src ?? "ja");
    const tgt = String(req.query.tgt ?? "vi");
    const kanji = await kanjiStore.lookupKanji(literal, src, tgt);
    if (!kanji) return res.status(404).json({ error: "Không tìm thấy kanji" });
    res.json({ kanji, examples: await kanjiStore.exampleWords(literal, src, tgt) });
  }),
);
