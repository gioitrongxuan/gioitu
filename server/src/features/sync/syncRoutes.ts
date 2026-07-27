// Sync routes (mounted at /api/sync). Pull + push, both scoped to the
// authenticated user via the bearer token. SQL lives in syncStore.
import { Router } from "express";
import { wrap, requireAuth, AuthedRequest } from "../../core/middleware.js";
import { sinceParam } from "../../core/queryParams.js";
import type { SyncEntry } from "./lww.js";
import * as syncStore from "./syncStore.js";

/**
 * Entry đẩy lên chỉ dùng được khi đủ khoá (term, term_lang) và mốc updated_at
 * hợp lệ — thiếu thì INSERT vi phạm NOT NULL, ném lỗi và ROLLBACK cả mẻ (một
 * entry hỏng làm mất luôn các entry lành). Lọc ở biên, bỏ qua entry hỏng.
 */
function isPushableEntry(e: unknown): e is SyncEntry {
  const o = e as Record<string, unknown> | null;
  return (
    typeof o?.term === "string" && o.term !== "" &&
    typeof o.term_lang === "string" && o.term_lang !== "" &&
    typeof o.updated_at === "number" && Number.isFinite(o.updated_at)
  );
}

export const syncRoutes = Router();

// Pull (SPEC 2.C).
syncRoutes.get(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    res.json(await syncStore.pull(req.userId!, sinceParam(req.query.since)));
  }),
);

// Push with last-write-wins by updated_at (SPEC 2.C).
syncRoutes.post(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const raw = req.body?.entries;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ error: "Thiếu mảng entries" });
    }
    const entries = raw.filter(isPushableEntry);
    // Shape phản hồi là mảng entry trần (client hiện bỏ qua body) — không có
    // chỗ gắn số entry bị bỏ, nên ghi log để còn lần ra khi client gửi rác.
    const skipped = raw.length - entries.length;
    if (skipped > 0) {
      console.error(`POST /api/sync: bỏ qua ${skipped}/${raw.length} entry hỏng (user ${req.userId})`);
    }
    res.json(await syncStore.push(req.userId!, entries));
  }),
);
