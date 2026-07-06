// AI routes (mounted /api/ai). Proxy mỏng tới Deepseek cho tính năng "sinh từ
// vựng" của màn Từ điển cá nhân (Issue #69) — luồng phân tích câu ví dụ (anki
// "+" Premium) gọi thẳng aiClient bên server/anki, không qua route này. Cần đăng
// nhập (requireAuth) để tránh biến endpoint thành proxy LLM ẩn danh (chi phí/lạm
// dụng). Client dựng prompt và phân tích kết quả; ở đây chỉ chuyển tiếp prompt.
import { Router } from "express";
import { wrap, requireAuth, AuthedRequest } from "../../core/middleware.js";
import { callDeepseek } from "./aiClient.js";

export const aiRoutes = Router();

aiRoutes.post(
  "/generate-vocab",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const prompt = String(req.body?.prompt ?? "").trim();
    if (!prompt) return res.status(400).json({ error: "Thiếu prompt" });
    try {
      res.json({ content: await callDeepseek(prompt) });
    } catch (err) {
      const msg = (err as Error).message;
      // "chưa được cấu hình" → 503 (chưa set khoá); còn lại (upstream) → 502.
      const status = msg.includes("chưa được cấu hình") ? 503 : 502;
      res.status(status).json({ error: msg });
    }
  }),
);
