// Nhờ AI gợi ý nhãn cho một thẻ (#249). Đi qua đúng proxy AI sẵn có của app
// (`/api/ai/generate-vocab`, gated đăng nhập để tránh lạm dụng LLM ẩn danh) —
// prompt và trình phân tích nằm ở domain/labels.ts, ở đây chỉ nối dây.

import { authToken } from "@/features/auth/data/auth";
import { generateVocab } from "@/features/dictionary/data/aiGenerate";
import { buildLabelPrompt, parseLabelResponse, LabelPromptInput } from "../domain/labels";

/**
 * Trả về danh sách nhãn gợi ý (đã chuẩn hoá, có thể rỗng nếu model trả rác).
 * Ném lỗi khi chưa đăng nhập hoặc gọi mạng hỏng để dialog hiện đúng lý do —
 * kiểm tra token ngay tại đây để thông báo nói về "gợi ý nhãn" thay vì mượn câu
 * của tính năng Generate từ vựng.
 */
export async function suggestLabels(input: LabelPromptInput): Promise<string[]> {
  if (!authToken()) throw new Error("Cần đăng nhập để nhờ AI gợi ý nhãn.");
  return parseLabelResponse(await generateVocab(buildLabelPrompt(input)));
}
