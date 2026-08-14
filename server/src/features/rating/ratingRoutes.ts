// Đánh giá ứng dụng (mounted /api/ratings). User gửi/sửa đánh giá của mình;
// admin đọc tổng hợp + danh sách. Gửi cần đăng nhập: đánh giá nặc danh thì
// không chặn được một người bấm nhiều lần, mà trung bình chỉ có nghĩa khi mỗi
// người một phiếu. SQL ở ratingStore.
import { Router } from "express";
import { wrap, requireAuth, requireAdmin, AuthedRequest } from "../../core/middleware.js";
import * as ratingStore from "./ratingStore.js";

export const ratingRoutes = Router();

// User: gửi hoặc sửa đánh giá của chính mình.
ratingRoutes.post(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const result = await ratingStore.submit(req.userId!, { stars: b.stars, note: b.note });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ ok: true });
  }),
);

// User: đánh giá hiện tại của mình (null nếu chưa đánh giá bao giờ).
ratingRoutes.get(
  "/mine",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    res.json({ rating: await ratingStore.mine(req.userId!) });
  }),
);

// Admin: tổng hợp (toàn bảng) + danh sách mới sửa gần nhất trước.
ratingRoutes.get(
  "/",
  requireAdmin,
  wrap(async (req, res) => {
    const [summary, items] = await Promise.all([
      ratingStore.summary(),
      ratingStore.list(req.query.limit),
    ]);
    res.json({ summary, items });
  }),
);
