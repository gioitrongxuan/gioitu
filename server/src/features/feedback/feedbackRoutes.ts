// Góp ý về web (mounted /api/feedback). User gửi; admin đọc và đánh dấu đã xử
// lý. Yêu cầu đăng nhập để gửi: góp ý nặc danh mở đường cho spam, và admin cần
// biết hỏi lại ai. SQL ở feedbackStore.
import { Router } from "express";
import { wrap, requireAuth, requireAdmin, AuthedRequest } from "../../core/middleware.js";
import * as feedbackStore from "./feedbackStore.js";

export const feedbackRoutes = Router();

// User: gửi một góp ý về app.
feedbackRoutes.post(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const result = await feedbackStore.submit(req.userId!, {
      kind: String(b.kind ?? ""),
      message: String(b.message ?? ""),
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  }),
);

// Admin: danh sách góp ý (mặc định chỉ phần đang chờ; ?status=all lấy cả đã xử lý).
feedbackRoutes.get(
  "/",
  requireAdmin,
  wrap(async (req, res) => {
    res.json(
      await feedbackStore.list({
        includeHandled: req.query.status === "all",
        limit: req.query.limit,
      }),
    );
  }),
);

// Admin: đánh dấu đã xử lý.
feedbackRoutes.post(
  "/:id/handled",
  requireAdmin,
  wrap(async (req: AuthedRequest, res) => {
    const ok = await feedbackStore.markHandled(String(req.params.id), req.userId!);
    if (!ok) return res.status(404).json({ error: "Không tìm thấy góp ý đang chờ" });
    res.json({ ok: true });
  }),
);
