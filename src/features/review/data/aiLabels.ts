// Nhờ AI gợi ý nhãn cho một thẻ (#249). Đi qua đúng proxy AI sẵn có của app
// (`/api/ai/generate-vocab`, gated đăng nhập để tránh lạm dụng LLM ẩn danh) —
// prompt và trình phân tích nằm ở domain/labels.ts, ở đây chỉ nối dây.

import { authToken } from "@/features/auth/data/auth";
import { generateVocab } from "@/features/dictionary/data/aiGenerate";
import { buildLabelPrompt, parseLabelResponse, LabelPromptInput } from "../domain/labels";
import {
  buildBulkLabelPrompt,
  buildTargetLabelPrompt,
  parseBulkLabelResponse,
  parseTargetLabelResponse,
  BulkLabelItem,
  BulkLabelSuggestion,
} from "../domain/bulkLabels";

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

/**
 * Gợi ý nhãn cho MỘT lô từ (gắn nhãn hàng loạt). Nơi gọi tự chia lô bằng
 * `batchItems` rồi gọi lần lượt — như vậy giao diện báo được tiến độ và một lô
 * hỏng không kéo cả mẻ theo. Ném lỗi cùng lý do với bản một-thẻ.
 */
export async function suggestLabelsForBatch(
  items: BulkLabelItem[],
  vocabulary: string[],
): Promise<BulkLabelSuggestion[]> {
  if (!authToken()) throw new Error("Cần đăng nhập để nhờ AI gợi ý nhãn.");
  return parseBulkLabelResponse(await generateVocab(buildBulkLabelPrompt(items, vocabulary)));
}

/**
 * Sàng MỘT lô từ theo một nhãn định trước (#266) — "từ nào trong lô này thuộc
 * *Thuật ngữ AWS*". Trả về cùng dạng với `suggestLabelsForBatch` nên nơi gọi
 * chia lô, báo tiến độ và duyệt kết quả y như lượt hàng loạt thường.
 */
export async function screenLabelForBatch(
  items: BulkLabelItem[],
  label: string,
): Promise<BulkLabelSuggestion[]> {
  if (!authToken()) throw new Error("Cần đăng nhập để nhờ AI gợi ý nhãn.");
  return parseTargetLabelResponse(await generateVocab(buildTargetLabelPrompt(items, label)), label);
}
