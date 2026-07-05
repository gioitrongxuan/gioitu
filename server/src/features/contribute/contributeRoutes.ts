// Đóng góp từ điển chung (mounted /api/contribute). User đề xuất; admin duyệt/từ
// chối. SQL + việc chèn vào từ điển hệ thống ở contributeStore.
import { Router } from "express";
import { wrap, requireAuth, requireAdmin, AuthedRequest } from "../../core/middleware.js";
import * as contributeStore from "./contributeStore.js";

export const contributeRoutes = Router();

// User: đề xuất một từ lên hệ thống (trạng thái pending).
contributeRoutes.post(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const result = await contributeStore.propose(req.userId!, {
      term_lang: String(b.term_lang ?? ""),
      native_lang: String(b.native_lang ?? ""),
      term: String(b.term ?? ""),
      reading: b.reading ? String(b.reading) : undefined,
      gloss: Array.isArray(b.gloss) ? b.gloss.map(String) : [],
      pos: Array.isArray(b.pos) ? b.pos.map(String) : [],
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  }),
);

// Admin: danh sách chờ duyệt.
contributeRoutes.get(
  "/pending",
  requireAdmin,
  wrap(async (_req, res) => {
    res.json(await contributeStore.listPending());
  }),
);

// Admin: duyệt (vào từ điển hệ thống) / từ chối.
contributeRoutes.post(
  "/:id/approve",
  requireAdmin,
  wrap(async (req: AuthedRequest, res) => {
    const ok = await contributeStore.approve(String(req.params.id), req.userId!);
    if (!ok) return res.status(404).json({ error: "Không tìm thấy đề xuất" });
    res.json({ ok: true });
  }),
);

contributeRoutes.post(
  "/:id/reject",
  requireAdmin,
  wrap(async (req: AuthedRequest, res) => {
    const ok = await contributeStore.reject(String(req.params.id), req.userId!);
    if (!ok) return res.status(404).json({ error: "Không tìm thấy đề xuất" });
    res.json({ ok: true });
  }),
);
