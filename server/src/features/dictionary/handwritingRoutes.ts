// Route nhận dạng viết tay (mount ở /api/handwriting). Công khai — chỉ chuyển
// tiếp các nét vẽ sang Google Input Tools. Handler mỏng; logic ở handwriting.ts.
import { Router } from "express";
import { wrap } from "../../core/middleware.js";
import { areStrokesValid, recognizeHandwriting } from "./handwriting.js";

export const handwritingRoutes = Router();

// POST { strokes: [[xs, ys, times], ...] } → { results: string[] }.
handwritingRoutes.post(
  "/",
  wrap(async (req, res) => {
    const strokes = (req.body as { strokes?: unknown })?.strokes;
    if (!areStrokesValid(strokes)) return res.status(400).json({ error: "Nét vẽ không hợp lệ" });
    res.json({ results: await recognizeHandwriting(strokes) });
  }),
);
