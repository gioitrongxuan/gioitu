// AI routes (mounted /api/ai). Proxy mỏng tới Deepseek cho tính năng "sinh từ
// vựng" của màn Từ điển cá nhân (Issue #69). Cần đăng nhập (requireAuth) để
// tránh biến endpoint thành proxy LLM ẩn danh (chi phí/lạm dụng). Client dựng
// prompt và phân tích kết quả; ở đây chỉ chuyển tiếp prompt và trả văn bản thô.
import { Router } from "express";
import { wrap, requireAuth, AuthedRequest } from "../../core/middleware.js";

export const aiRoutes = Router();

// Deepseek dùng API tương thích OpenAI.
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

aiRoutes.post(
  "/generate-vocab",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Tính năng AI chưa được cấu hình trên máy chủ." });
    }

    const prompt = String(req.body?.prompt ?? "").trim();
    if (!prompt) return res.status(400).json({ error: "Thiếu prompt" });

    let upstream: Response;
    try {
      upstream = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            {
              role: "system",
              content:
                "Bạn trả về DUY NHẤT một đối tượng JSON hợp lệ theo schema người dùng yêu cầu, không kèm giải thích hay markdown.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });
    } catch {
      return res.status(502).json({ error: "Không gọi được dịch vụ AI." });
    }

    const data = (await upstream.json().catch(() => ({}))) as ChatResponse;
    if (!upstream.ok) {
      return res.status(502).json({ error: data.error?.message ?? "Dịch vụ AI trả về lỗi." });
    }

    const content = data.choices?.[0]?.message?.content ?? "";
    res.json({ content });
  }),
);
