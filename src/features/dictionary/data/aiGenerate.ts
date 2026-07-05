// Sinh từ vựng bằng AI (Issue #69, Tab B). Server chỉ là proxy mỏng tới
// Deepseek: client dựng prompt (domain/customEntry.buildAiPrompt) và phân tích
// kết quả (parseAiResponse) — cùng đường với luồng "dán tay", nên chỉ có MỘT
// trình dựng prompt và MỘT trình phân tích. Ở đây chỉ gọi mạng và lấy văn bản
// thô model trả về. Cần đăng nhập (endpoint gated để tránh lạm dụng LLM ẩn danh).

import { authToken } from "@/features/auth/data/auth";

/**
 * Gửi prompt tới máy chủ và nhận VĂN BẢN thô do model trả về (kỳ vọng là JSON).
 * Người gọi tự `parseAiResponse` để chuyển thành các dòng nháp. Ném lỗi máy chủ
 * (chưa cấu hình khoá, mạng…) để UI hiển thị.
 */
export async function generateVocab(prompt: string): Promise<string> {
  const token = authToken();
  if (!token) throw new Error("Cần đăng nhập để dùng tính năng Generate. Bạn vẫn có thể dùng “Lấy Prompt”.");

  let res: Response;
  try {
    res = await fetch("/api/ai/generate-vocab", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt }),
    });
  } catch {
    throw new Error("Không kết nối được tới máy chủ (backend chưa chạy?)");
  }

  const data = (await res.json().catch(() => ({}))) as { content?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Yêu cầu thất bại");
  return data.content ?? "";
}
