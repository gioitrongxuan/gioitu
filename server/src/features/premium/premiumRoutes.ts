// Premium routes (mounted at /api/premium). Admin sinh/liệt kê mã; user đổi mã.
// Việc "sync có được phép không" đọc cờ is_premium ở nơi gác cổng sync (canSyncDicts),
// không nằm ở JWT — nên đổi mã xong là hiệu lực ngay ở request sau.
import { Router } from "express";
import { wrap, requireAuth, requireAdmin, AuthedRequest } from "../../core/middleware.js";
import * as premiumStore from "./premiumStore.js";

export const premiumRoutes = Router();

// Admin: sinh mã kích hoạt để phát tay (chưa tích hợp thanh toán).
premiumRoutes.post(
  "/codes",
  requireAdmin,
  wrap(async (req, res) => {
    const count = Number(req.body?.count ?? 1);
    res.json({ codes: await premiumStore.generateCodes(count) });
  }),
);

premiumRoutes.get(
  "/codes",
  requireAdmin,
  wrap(async (_req, res) => {
    res.json(await premiumStore.listCodes());
  }),
);

// User: đổi mã → mở khoá Premium cho tài khoản.
premiumRoutes.post(
  "/redeem",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const result = await premiumStore.redeemCode(req.userId!, req.body?.code);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ is_premium: true });
  }),
);
