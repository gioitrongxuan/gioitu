// Deepseek API client (tương thích OpenAI). Một chỗ duy nhất gọi upstream để
// /api/ai/* và luồng phân tích câu (anki "+" Premium) cùng dùng. Trả về VĂN BẢN
// thô do model sinh (kỳ vọng JSON khi chạy ở chế độ response_format json_object).
// Ném lỗi khi chưa cấu hình khoá hoặc upstream lỗi — nơi gọi tự quyết cách phản hồi.

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

const JSON_ONLY_SYSTEM =
  "Bạn trả về DUY NHẤT một đối tượng JSON hợp lệ theo schema người dùng yêu cầu, không kèm giải thích hay markdown.";

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/**
 * Gửi một prompt tới Deepseek ở chế độ JSON object và trả về văn bản thô._system
 * mặc định ép model chỉ trả JSON (dùng cho cả sinh từ vựng lẫn phân tích câu).
 */
export async function callDeepseek(prompt: string, system = JSON_ONLY_SYSTEM): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("Tính năng AI chưa được cấu hình trên máy chủ.");

  let upstream: Response;
  try {
    upstream = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });
  } catch {
    throw new Error("Không gọi được dịch vụ AI.");
  }

  const data = (await upstream.json().catch(() => ({}))) as ChatResponse;
  if (!upstream.ok) throw new Error(data.error?.message ?? "Dịch vụ AI trả về lỗi.");
  return data.choices?.[0]?.message?.content ?? "";
}