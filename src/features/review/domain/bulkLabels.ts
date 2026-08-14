// Gắn nhãn HÀNG LOẠT bằng AI cho những từ đang được lọc trên bản đồ (#249) —
// logic thuần, không I/O. Bản một-thẻ nằm ở labels.ts; ở đây khác ba chỗ:
//
// 1. Một lượt hỏi gánh nhiều từ (`BULK_LABEL_BATCH_SIZE`) để 60 từ không thành
//    60 lượt gọi model; nhưng vẫn chia lô để prompt không phình và để một lô
//    hỏng không kéo theo cả mẻ.
// 2. Kết quả phải khớp lại đúng thẻ, nên model được yêu cầu trả kèm mặt chữ.
// 3. Nhãn AI đề xuất KHÔNG ghi thẳng: `proposeBulkLabels` chỉ tính phần *sẽ
//    thêm* để giao diện bày ra cho người dùng duyệt. Đây là thao tác ghi lên
//    hàng chục thẻ một lúc — DESIGN §3.9: phản hồi chỉ xác nhận điều đã thực sự
//    xảy ra, và người dùng phải thấy trước mình sắp đổi gì.

import { addLabel, entryLabels, mergeLabels, stripCodeFence, MAX_LABEL_LENGTH } from "./labels";

/** Số từ gửi trong MỘT lượt hỏi: đủ để tiết kiệm lượt gọi, đủ ngắn để model
 *  không bỏ sót từ ở cuối danh sách. */
export const BULK_LABEL_BATCH_SIZE = 20;

/** Trần nhãn AI được đề xuất cho MỖI từ trong lượt hàng loạt — thấp hơn trần
 *  của thẻ (`MAX_LABELS_PER_ENTRY`) vì gắn hàng loạt dễ làm loãng bộ lọc: một
 *  nhãn đúng cho cả nhóm quý hơn bốn nhãn na ná cho từng từ. */
export const MAX_BULK_LABELS_PER_ENTRY = 3;

/**
 * Trần số từ cho một lượt gắn hàng loạt. Bản đồ có thể đang lọc ra cả nghìn từ;
 * hỏi hết là hàng chục lượt gọi model, chờ rất lâu và tốn quota chung. Giao diện
 * phải nói rõ đang cắt bao nhiêu chứ không lặng lẽ bỏ phần đuôi.
 */
export const MAX_BULK_LABEL_ENTRIES = 100;

/** Ngữ cảnh một từ gửi cho AI trong lượt hàng loạt. */
export interface BulkLabelItem {
  term: string;
  reading?: string;
  meaning?: string;
  /** Nhãn thẻ đang mang: để AI đừng đề xuất lại. */
  current: string[];
}

/** Nhãn AI đề xuất cho một mặt chữ. */
export interface BulkLabelSuggestion {
  term: string;
  labels: string[];
}

/** Chia danh sách thành từng lô để hỏi model. Lô cuối ngắn hơn là chuyện thường. */
export function batchItems<T>(items: T[], size = BULK_LABEL_BATCH_SIZE): T[][] {
  if (size < 1) return items.length ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Một dòng mô tả từ trong prompt: `会議 [かいぎ] — cuộc họp (đã có: N3)`. */
function describeItem(item: BulkLabelItem): string {
  let line = item.term;
  if (item.reading?.trim()) line += ` [${item.reading.trim()}]`;
  if (item.meaning?.trim()) line += ` — ${item.meaning.trim()}`;
  if (item.current.length) line += ` (đã có: ${item.current.join(", ")})`;
  return line;
}

/**
 * Prompt gắn nhãn hàng loạt. Cùng đường với `buildLabelPrompt`: dựng ở domain,
 * gọi qua proxy `/api/ai/generate-vocab`, ĐÒI JSON. Nhấn mạnh hai điều mà bản
 * một-thẻ không cần: **trả đủ mọi từ** (model hay tóm tắt vài dòng đầu rồi
 * "…") và **trả kèm mặt chữ** (không có nó thì không khớp lại được thẻ nào).
 */
export function buildBulkLabelPrompt(items: BulkLabelItem[], vocabulary: string[]): string {
  const lines: string[] = [
    "Bạn là trợ lý sắp xếp từ vựng. Hãy gợi ý nhãn phân loại NGẮN (tiếng Việt) cho TỪNG từ trong danh sách dưới đây.",
    `Danh sách ${items.length} từ:`,
    items.map((item) => `- ${describeItem(item)}`).join("\n"),
  ];
  if (vocabulary.length) {
    lines.push(
      "Ưu tiên dùng lại các nhãn đã có sau đây nếu phù hợp (chỉ đặt nhãn mới khi không cái nào hợp):",
      vocabulary.map((l) => `- ${l}`).join("\n"),
    );
  }
  lines.push(
    `Mỗi nhãn tối đa ${MAX_LABEL_LENGTH} ký tự, là chủ đề/lĩnh vực/trình độ/sắc thái, KHÔNG phải nghĩa của từ.`,
    `Mỗi từ tối đa ${MAX_BULK_LABELS_PER_ENTRY} nhãn; đừng lặp lại nhãn từ đó đã có.`,
    "Những từ cùng chủ đề nên mang CHUNG một nhãn, đừng đặt mỗi từ một nhãn riêng.",
    "Trả về ĐỦ mọi từ trong danh sách, giữ nguyên mặt chữ của từ.",
    "Trả về DUY NHẤT một đối tượng JSON, không kèm giải thích, theo schema:",
    '{ "results": [{ "term": "từ", "labels": ["nhãn 1", "nhãn 2"] }] }',
  );
  return lines.join("\n");
}

/** Khoá khớp thẻ với kết quả AI: model hay trả lệch hoa/thường và khoảng trắng. */
function termKey(term: string): string {
  return term.trim().toLocaleLowerCase("vi");
}

/** Đọc mảng nhãn từ một phần tử kết quả, chấp nhận vài tên khoá model hay dùng. */
function readLabels(obj: Record<string, unknown>): string[] {
  const found = ["labels", "tags", "nhan", "nhãn"].map((k) => obj[k]).find(Array.isArray);
  if (!Array.isArray(found)) return [];
  // addLabel gánh việc chuẩn hoá + khử trùng trong nội bộ một từ; ở đây chỉ chặn
  // thêm trần riêng của lượt hàng loạt (thấp hơn trần của thẻ).
  let out: string[] = [];
  for (const item of found) {
    if (typeof item !== "string") continue;
    if (out.length >= MAX_BULK_LABELS_PER_ENTRY) break;
    out = addLabel(out, item) ?? out;
  }
  return out;
}

/**
 * Phân tích kết quả hàng loạt. Khoan dung như `parseLabelResponse`: chấp nhận
 * mảng trần hoặc object bọc (`results`/`labels`/…), bỏ qua phần tử không dùng
 * được thay vì ném — một dòng hỏng không được làm mất cả mẻ. Phần tử thiếu mặt
 * chữ hoặc không còn nhãn nào sau khi chuẩn hoá thì bỏ.
 */
export function parseBulkLabelResponse(text: string): BulkLabelSuggestion[] {
  const cleaned = stripCodeFence(text ?? "");
  if (!cleaned) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  let raw: unknown[] = [];
  if (Array.isArray(parsed)) {
    raw = parsed;
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const found =
      ["results", "labels", "words", "items", "data"].map((k) => obj[k]).find(Array.isArray) ??
      Object.values(obj).find(Array.isArray);
    if (Array.isArray(found)) raw = found;
  }

  const out: BulkLabelSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const termRaw = ["term", "word", "tu", "từ"].map((k) => obj[k]).find((v) => typeof v === "string");
    if (typeof termRaw !== "string" || !termRaw.trim()) continue;
    const labels = readLabels(obj);
    if (!labels.length) continue;
    // Model trả cùng một từ hai lần thì lấy lượt đầu — lượt sau thường là bản
    // rút gọn/lặp lại của chính nó.
    const key = termKey(termRaw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ term: termRaw.trim(), labels });
  }
  return out;
}

/** Một đề xuất đã khớp về thẻ thật: `added` là phần SẼ thêm, chưa ghi. */
export interface LabelProposal<T> {
  entry: T;
  /** Nhãn thẻ đang mang (đã chuẩn hoá). */
  current: string[];
  /** Nhãn mới sẽ thêm — đã trừ nhãn trùng và phần vượt trần của thẻ. */
  added: string[];
}

/**
 * Khớp kết quả AI về từng thẻ và tính phần *thực sự thêm được*: bỏ nhãn thẻ đã
 * có, bỏ phần vượt trần `MAX_LABELS_PER_ENTRY`. Thẻ không còn gì để thêm thì
 * không xuất hiện trong kết quả — giao diện khỏi bày ra một dòng "không đổi" và
 * người dùng khỏi ghi lại một bản y hệt.
 *
 * Khớp theo mặt chữ (không phân biệt hoa/thường): hai thẻ khác ngôn ngữ mà cùng
 * mặt chữ thì cùng nhận đề xuất — hiếm, và vẫn đúng hơn là bỏ sót một thẻ.
 */
export function proposeBulkLabels<T extends { term: string; labels?: string[] }>(
  entries: T[],
  suggestions: BulkLabelSuggestion[],
): LabelProposal<T>[] {
  const byTerm = new Map(suggestions.map((s) => [termKey(s.term), s.labels]));
  const out: LabelProposal<T>[] = [];
  for (const entry of entries) {
    const labels = byTerm.get(termKey(entry.term));
    if (!labels?.length) continue;
    const current = entryLabels(entry);
    const added = mergeLabels(current, labels).slice(current.length);
    if (added.length) out.push({ entry, current, added });
  }
  return out;
}
