// Link chia sẻ tạm (#70 — 5.2). POST /api/share nhận .zip (base64) từ người đã
// đăng nhập → trả id + hạn dùng. GET /api/dl/:id tải file khi còn sống (không cần
// auth: ai có link là tải được — đúng bản chất "chia sẻ"). Cả hai nằm dưới /api
// để không bị SPA fallback nuốt.
import { Router } from "express";
import { wrap, requireAuth } from "../../core/middleware.js";
import * as shareStore from "./shareStore.js";

export const shareRoutes = Router();

shareRoutes.post(
  "/share",
  requireAuth,
  wrap(async (req, res) => {
    const data = req.body?.data;
    const filename = typeof req.body?.filename === "string" ? req.body.filename : "tu-dien.zip";
    if (typeof data !== "string" || !data) return res.status(400).json({ error: "Thiếu dữ liệu" });

    const result = await shareStore.create(Buffer.from(data, "base64"), filename);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ id: result.id, expires_at: result.expires_at });
  }),
);

shareRoutes.get(
  "/dl/:id",
  wrap(async (req, res) => {
    const found = await shareStore.get(String(req.params.id));
    if (!found) return res.status(410).send("Link đã hết hạn hoặc không tồn tại");
    res.setHeader("Content-Type", "application/zip");
    // filename* (RFC 5987) để tên tiếng Việt không vỡ header.
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(found.filename)}`);
    res.send(found.blob);
  }),
);
