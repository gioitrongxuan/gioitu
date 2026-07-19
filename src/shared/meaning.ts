// Bộ phân tích thuần cho các payload lưu kèm một từ (meaning/example/analysis).
// Tách khỏi MeaningView (React) để cả logic thuần — như tooltip Word Cloud — tái
// dùng được mà không kéo theo React/DOM.
//
// Nghĩa và ví dụ lưu dạng JSON string[] (xem review/domain/lookup và Yomitan
// sync); phân tích AI lưu dạng JSON Record<câu, SentenceAnalysis>. Mọi hàm đều
// khoan dung: payload hỏng/kiểu lạ → trả về rỗng thay vì ném.

import { SentenceAnalysis } from "@/shared/types";

/** Parse a stored `meaning` (JSON string[] or plain text) into gloss lines. */
export function meaningToLines(meaning: string): string[] {
  try {
    const parsed = JSON.parse(meaning);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* plain text, not JSON */
  }
  return meaning ? [meaning] : [];
}

/** Parse a stored `example` (JSON string[] or legacy plain text) into sentences. */
export function exampleToLines(example: string | undefined): string[] {
  if (!example) return [];
  try {
    const parsed = JSON.parse(example);
    if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
  } catch {
    /* legacy plain text, not JSON */
  }
  const text = example.trim();
  return text ? [text] : [];
}

/**
 * Parse a stored `analysis` (JSON `Record<câu, SentenceAnalysis>`) thành bản đồ
 * tra nhanh theo câu. Khoan dung: payload hỏng/kiểu lạ → bản đồ rỗng (UI chỉ ẩn
 * nút phân tích, không lỗi).
 */
export function analysisToMap(analysis: string | undefined): Record<string, SentenceAnalysis> {
  if (!analysis) return {};
  try {
    const parsed = JSON.parse(analysis);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, SentenceAnalysis> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (v && typeof v === "object") {
          const a = v as Record<string, unknown>;
          const usage = typeof a.usage === "string" ? a.usage : "";
          const meaning = typeof a.meaning === "string" ? a.meaning : "";
          if (usage || meaning) out[k] = { usage, meaning };
        }
      }
      return out;
    }
  } catch {
    /* not JSON */
  }
  return {};
}
