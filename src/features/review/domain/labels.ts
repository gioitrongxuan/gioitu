// Nhãn người dùng gắn cho thẻ (#249) — logic thuần, không I/O.
//
// Trong repo này chữ "tag" đã có chủ: `CloudTag` là một thẻ từ trên Word Cloud,
// còn `dictionary/domain/tags.ts` là tag từ loại của Yomitan. Nhãn do người dùng
// tự đặt ("ngữ pháp", "N3", "chỗ làm"…) nên gọi là **label** trong code và
// "nhãn" trong giao diện, để đọc code không phải đoán đang nói tới tag nào.
//
// Nhãn nằm ngay trên `VocabEntry.labels` (mảng đã chuẩn hoá) nên đi cùng entry
// qua LWW như mọi field khác; không có store riêng, không cần bump DB_VERSION.

import { VocabEntry } from "@/shared/types";

/** Nhãn dài hơn thế này thành nguyên câu — cắt để chip còn đọc được. */
export const MAX_LABEL_LENGTH = 24;

/** Trần số nhãn mỗi thẻ: đủ để phân loại, không đủ để biến thành ghi chú. */
export const MAX_LABELS_PER_ENTRY = 8;

/**
 * Chuẩn hoá một nhãn người dùng gõ: bỏ khoảng trắng thừa, gộp khoảng trắng giữa
 * chừng, bỏ dấu `#` mở đầu (thói quen gõ hashtag) và cắt theo độ dài tối đa.
 * Trả về chuỗi rỗng khi không còn gì đáng lưu.
 */
export function normalizeLabel(raw: string): string {
  // Cắt trắng TRƯỚC khi bỏ `#` để " #ngữ pháp" cũng rụng dấu, và cắt trắng lần
  // nữa sau khi cắt độ dài (nhát cắt có thể rơi đúng vào giữa khoảng trắng).
  return raw.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH).trim();
}

/** Khoá so trùng: nhãn khác nhau mỗi hoa/thường là cùng một nhãn. */
function labelKey(label: string): string {
  return label.toLocaleLowerCase("vi");
}

/**
 * Danh sách nhãn của một entry, đã làm sạch: bỏ phần tử không phải chuỗi (bản
 * ghi cũ / dữ liệu lạ từ cloud), chuẩn hoá, khử trùng theo khoá không phân biệt
 * hoa thường (giữ cách viết gặp đầu tiên) và cắt theo trần.
 */
export function entryLabels(entry: Pick<VocabEntry, "labels">): string[] {
  const raw = Array.isArray(entry.labels) ? entry.labels : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const label = normalizeLabel(item);
    if (!label) continue;
    const key = labelKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= MAX_LABELS_PER_ENTRY) break;
  }
  return out;
}

/**
 * Thêm một nhãn vào danh sách. Trả về `null` khi KHÔNG có gì thay đổi (nhãn
 * rỗng, đã có sẵn, hoặc đã chạm trần) để nơi gọi khỏi ghi lại một bản y hệt —
 * mỗi lần ghi là một lần bump `updated_at` và một lượt đẩy đồng bộ.
 */
export function addLabel(labels: string[], raw: string): string[] | null {
  const label = normalizeLabel(raw);
  if (!label) return null;
  if (labels.length >= MAX_LABELS_PER_ENTRY) return null;
  if (labels.some((l) => labelKey(l) === labelKey(label))) return null;
  return [...labels, label];
}

/** Gỡ một nhãn (không phân biệt hoa thường). */
export function removeLabel(labels: string[], label: string): string[] {
  const key = labelKey(label);
  return labels.filter((l) => labelKey(l) !== key);
}

/** Một nhãn kèm số thẻ đang mang nó — nguồn cho dropdown lọc và gợi ý. */
export interface LabelCount {
  label: string;
  count: number;
}

/**
 * Gom nhãn của cả kho: nhãn nhiều thẻ nhất lên trước, hoà thì theo alphabet
 * tiếng Việt. Cách viết hiển thị lấy theo lần gặp đầu tiên (khử trùng như
 * `entryLabels`).
 */
export function labelCounts(entries: Pick<VocabEntry, "labels">[]): LabelCount[] {
  const counts = new Map<string, LabelCount>();
  for (const entry of entries) {
    for (const label of entryLabels(entry)) {
      const key = labelKey(label);
      const found = counts.get(key);
      if (found) found.count += 1;
      else counts.set(key, { label, count: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "vi"),
  );
}

/**
 * Lựa chọn lọc theo nhãn: `"all"` = không lọc, `"none"` = thẻ chưa gắn nhãn nào,
 * còn lại là chính tên nhãn.
 */
export type LabelFilter = "all" | "none" | (string & {});

export function hasLabel(entry: Pick<VocabEntry, "labels">, label: string): boolean {
  const key = labelKey(label);
  return entryLabels(entry).some((l) => labelKey(l) === key);
}

/** Lọc danh sách theo lựa chọn nhãn (giữ nguyên thứ tự đến). */
export function filterByLabel<T extends Pick<VocabEntry, "labels">>(
  entries: T[],
  filter: LabelFilter,
): T[] {
  if (filter === "all") return entries;
  if (filter === "none") return entries.filter((e) => entryLabels(e).length === 0);
  return entries.filter((e) => hasLabel(e, filter));
}

/** Ngữ cảnh gửi cho AI khi nhờ gợi ý nhãn cho một thẻ. */
export interface LabelPromptInput {
  term: string;
  reading?: string;
  /** Nghĩa (một dòng là đủ — prompt cần ngữ cảnh, không cần cả mục từ). */
  meaning?: string;
  /** Nhãn đang có trên thẻ: để AI đừng lặp lại. */
  current: string[];
  /** Nhãn đã dùng ở nơi khác trong kho: ưu tiên tái dùng thay vì đẻ nhãn mới. */
  vocabulary: string[];
}

/**
 * Prompt nhờ AI gợi ý nhãn. Cùng đường với các prompt khác trong app: dựng ở
 * domain, gọi qua proxy `/api/ai/generate-vocab`, và ĐÒI JSON để phân tích được
 * bằng `parseLabelResponse`. Nhấn mạnh việc tái dùng nhãn sẵn có — nếu không,
 * mỗi thẻ sẽ mang một nhãn gần-giống-nhau và bộ lọc thành vô dụng.
 */
export function buildLabelPrompt(input: LabelPromptInput): string {
  const lines: string[] = [
    "Bạn là trợ lý sắp xếp từ vựng. Hãy gợi ý nhãn phân loại NGẮN (tiếng Việt) cho từ dưới đây.",
    `Từ: ${input.term}`,
  ];
  if (input.reading?.trim()) lines.push(`Cách đọc: ${input.reading.trim()}`);
  if (input.meaning?.trim()) lines.push(`Nghĩa: ${input.meaning.trim()}`);
  if (input.vocabulary.length) {
    lines.push(
      "Ưu tiên dùng lại các nhãn đã có sau đây nếu phù hợp (chỉ đặt nhãn mới khi không cái nào hợp):",
      input.vocabulary.map((l) => `- ${l}`).join("\n"),
    );
  }
  if (input.current.length) {
    lines.push(`Thẻ đã có sẵn các nhãn: ${input.current.join(", ")} — đừng lặp lại.`);
  }
  lines.push(
    `Mỗi nhãn tối đa ${MAX_LABEL_LENGTH} ký tự, là chủ đề/lĩnh vực/trình độ/sắc thái, KHÔNG phải nghĩa của từ.`,
    "Gợi ý tối đa 4 nhãn.",
    "Trả về DUY NHẤT một đối tượng JSON, không kèm giải thích, theo schema:",
    '{ "labels": ["nhãn 1", "nhãn 2"] }',
  );
  return lines.join("\n");
}

/** Thêm nhiều nhãn một lượt, bỏ qua nhãn rỗng/trùng/vượt trần (xem `addLabel`). */
export function mergeLabels(labels: string[], extra: string[]): string[] {
  let out = labels;
  for (const raw of extra) out = addLabel(out, raw) ?? out;
  return out;
}

/**
 * Gỡ hàng rào code ```…``` quanh JSON model trả về (soi gương customEntry.ts).
 * Export để `bulkLabels.ts` dùng chung — hai trình phân tích cùng ăn một kiểu
 * rác của model, không nên có hai bản lệch nhau.
 */
export function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Phân tích kết quả AI thành danh sách nhãn. Khoan dung như các trình phân tích
 * AI khác trong app: chấp nhận mảng trần, object bọc `{ labels: [...] }` hay
 * `{ tags: [...] }`; bỏ qua phần tử không dùng được thay vì ném lỗi; chuẩn hoá
 * và khử trùng để kết quả cắm thẳng vào `addLabel` được.
 */
export function parseLabelResponse(text: string): string[] {
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
      ["labels", "tags", "nhan", "result", "results"]
        .map((k) => obj[k])
        .find(Array.isArray) ?? Object.values(obj).find(Array.isArray);
    if (Array.isArray(found)) raw = found;
  }

  return entryLabels({ labels: raw.filter((v): v is string => typeof v === "string") });
}
