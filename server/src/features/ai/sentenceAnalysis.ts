// Phân tích câu ví dụ bằng AI — logic THUẦN (không I/O): dựng prompt yêu cầu
// Deepseek trả JSON { usage, meaning } và phân tích kết quả. Tách riêng như
// domain/customEntry bên frontend: server/anki (I/O) bọc quanh. Tiêu chí:
// biết từ được dùng như nào trong câu + ý nghĩa cả câu.

import type { SentenceAnalysis } from "@/shared/types";

export interface SentenceAnalysisInput {
  term: string;
  reading?: string;
  sentence: string;
  term_lang: string;
  native_lang: string;
}

const LANG_NAMES: Record<string, string> = { ja: "tiếng Nhật", vi: "tiếng Việt", en: "tiếng Anh" };
const langName = (code: string): string => LANG_NAMES[code] ?? code;

/**
 * Prompt yêu cầu model phân tích một câu chứa từ: cách từ được dùng + ý nghĩa câu.
 * Kỳ vọng model trả JSON đúng schema `{ "usage": string, "meaning": string }`.
 */
export function buildSentenceAnalysisPrompt(input: SentenceAnalysisInput): string {
  const { term, reading, sentence, term_lang, native_lang } = input;
  const src = langName(term_lang);
  const tgt = langName(native_lang);
  const readingPart = reading ? ` (đọc: ${reading})` : "";
  return [
    `Bạn là trợ lý ngôn ngữ. Cho từ ${src} "${term}"${readingPart} và một câu chứa từ đó:`,
    `Câu: ${sentence}`,
    `Hãy phân tích và trả về JSON đúng schema sau:`,
    `{ "usage": "<cách từ '${term}' được dùng trong câu — từ loại, vai trò ngữ pháp, ngữ cảnh sắc thái>", "meaning": "<ý nghĩa cả câu, diễn giải bằng ${tgt}>" }`,
    `Chỉ trả JSON, không kèm markdown hay giải thích thêm.`,
  ].join("\n");
}

/**
 * Phân tích văn bản model trả về thành `SentenceAnalysis`. Khoan dung: chấp nhận
 * JSON object có hai trường (thiếu một trường vẫn dùng được); trả null nếu không
 * đọc được JSON hoặc cả hai trường đều rỗng.
 */
export function parseSentenceAnalysis(content: string): SentenceAnalysis | null {
  if (!content) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const usage = typeof o.usage === "string" ? o.usage.trim() : "";
  const meaning = typeof o.meaning === "string" ? o.meaning.trim() : "";
  if (!usage && !meaning) return null;
  return { usage, meaning };
}