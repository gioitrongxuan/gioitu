// Vocab-list study — overlay tiến độ SRS của người dùng lên một danh sách từ
// (nguồn đầu tiên: study list server-side). Mô phỏng kanjistats/domain/kanjigrid:
// hàm thuần, không I/O, không `Date.now()` — `now` do caller truyền để test
// deterministic. UI bọc quanh (data/ load danh sách, ui/ render lưới).
//
// Khác với kanji grid (overlay lên bộ JLPT cố định), đây overlay lên danh sách từ
// mà người dùng tự thu thập: mỗi từ được ghép với entry SRS khớp (term + term_lang)
// rồi phân một trong bốn trạng thái học, để người dùng thấy ngay từ nào đã thuộc,
// đang học, đến hạn ôn, hay chưa cho vào hàng đợi.

import { VocabEntry } from "@/shared/types";
import { isReviewable } from "@/features/review/domain/lifecycle";

/** Một từ trong danh sách nguồn — chưa biết gì về tiến độ SRS của người dùng. */
export interface VocabListWord {
  term: string;
  reading?: string;
  term_lang: string;
  native_lang: string;
}

/**
 * Trạng thái học của một từ trong danh sách, nhìn từ góc SRS. Thứ tự cũng là thứ
 * tự tăng "mastery" để UI sắp xếp/đếm nhất quán.
 *  - missing  : chưa có entry → chưa cho vào hàng ôn
 *  - learning : có card nhưng chưa đến hạn
 *  - due      : có card và đến hạn ôn (isReviewable)
 *  - learned  : đã thuộc (status LEARNED)
 */
export type VocabProgress = "missing" | "learning" | "due" | "learned";

/** Một ô danh sách: từ nguồn gắn với entry SRS (nếu có) + trạng thái phái sinh. */
export interface VocabCell {
  word: VocabListWord;
  entry?: VocabEntry;
  progress: VocabProgress;
}

/** Khóa ghép SRS: (term, term_lang) — đủ phân biệt từ cùng chữ khác ngôn ngữ,
 *  khớp với cách Word Cloud / store định danh entry (user_id + term + term_lang). */
function entryKey(term: string, term_lang: string): string {
  return `${term}\u0000${term_lang}`;
}

/**
 * Overlay entries của người dùng lên danh sách từ nguồn. Mỗi từ ghép entry SRS
 * khớp (term + term_lang) rồi phân trạng thái qua `classify`. Từ trùng trong
 * danh sách (cùng term + term_lang) chỉ giữ ô đầu — tránh đếm ảo khi một list
 * vô tình chứa bản lặp.
 */
export function applyProgress(words: VocabListWord[], entries: VocabEntry[], now: number): VocabCell[] {
  const byKey = new Map<string, VocabEntry>();
  for (const e of entries) {
    // Tombstone không hiện trên cloud (store đã lọc), nhưng phòng hờ: một entry
    // đã xoá không được tính là "đã có" — để từ hiện lại như chưa cho vào list.
    if (e.deleted_at != null) continue;
    byKey.set(entryKey(e.term, e.term_lang), e);
  }

  const seen = new Set<string>();
  const cells: VocabCell[] = [];
  for (const word of words) {
    const k = entryKey(word.term, word.term_lang);
    if (seen.has(k)) continue;
    seen.add(k);
    const entry = byKey.get(k);
    cells.push({ word, entry, progress: classify(entry, now) });
  }
  return cells;
}

/** Phân trạng thái học của một entry so với thời điểm `now`. Thuần, không I/O. */
export function classify(entry: VocabEntry | undefined, now: number): VocabProgress {
  if (!entry) return "missing";
  if (entry.status === "LEARNED") return "learned";
  if (entry.card_state != null && isReviewable(entry, now)) return "due";
  if (entry.card_state != null) return "learning";
  // Có entry nhưng chưa có card (vẫn trong giai đoạn gating chưa đủ lượt tra) —
  // coi như chưa chính thức vào hàng ôn, hiển thị như "missing" để khuyến khích
  // bấm "cho học" tạo thẻ luôn.
  return "missing";
}

/** Sắc độ heatmap cho một ô, dùng chung thang `heatBackground`/`heatTextColor`
 *  với kanji grid: đã thuộc mạnh nhất, đến hạn / đang học trung bình, chưa có yếu. */
export function cellShade(progress: VocabProgress): number {
  switch (progress) {
    case "learned":
      return 1;
    case "due":
      return 0.78;
    case "learning":
      return 0.6;
    case "missing":
      return 0;
  }
}

export interface ProgressCounts {
  total: number;
  missing: number;
  learning: number;
  due: number;
  learned: number;
}

/** Đếm số ô theo từng trạng thái — cho thanh tiến độ và tóm tắt trên UI. */
export function countProgress(cells: VocabCell[]): ProgressCounts {
  const c: ProgressCounts = { total: cells.length, missing: 0, learning: 0, due: 0, learned: 0 };
  for (const cell of cells) c[cell.progress] += 1;
  return c;
}

/** Phần trăm nguyên của `part` trên `whole` (0 khi whole = 0) — giống kanjigrid. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
