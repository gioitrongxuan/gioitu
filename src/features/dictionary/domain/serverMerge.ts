// Gộp kết quả tra từng dạng biến cách trên nguồn Server. Máy chủ không tự
// deinflect được, nên caller tra SONG SONG mọi dạng ứng viên rồi đưa các mẻ
// kết quả (theo đúng thứ tự ứng viên, exact-first) vào đây để hợp nhất.
//
// Logic thuần tách khỏi `data/sources.ts` vì phần dễ sai khi song song hoá nằm ở
// đây: khoá theo (term, reading) để đồng âm không gộp; khi trùng khoá thì giữ
// ứng viên ÍT lý do biến cách nhất, và khi hoà thì giữ ứng viên ĐẾN TRƯỚC (danh
// sách ứng viên xếp exact-first) — đúng hành vi "first-wins" của vòng lặp tuần
// tự cũ. Cuối cùng xếp exact (ít lý do) trước, rồi phổ biến (score) giảm dần.

/** Mục tối thiểu cần để khoá/xếp — DictEntry thoả (term, reading?, score?). */
export interface MergeableEntry {
  term: string;
  reading?: string;
  score?: number;
}

/** Một mẻ: các entry máy chủ trả cho một dạng ứng viên, kèm lý do biến cách. */
export interface CandidateHit<E extends MergeableEntry> {
  reasons: string[];
  entries: E[];
}

/** Kết quả gộp: giữ hình dạng khớp `TermResult` ({ entry, reasons, source }). */
export interface MergedHit<E extends MergeableEntry> {
  entry: E;
  reasons: string[];
  source: string;
}

/** (term, reading) key — khớp findTerms/fuzzyTerms để dedupe xuyên nguồn. */
function termReadingKey(entry: MergeableEntry): string {
  return JSON.stringify([entry.term, entry.reading ?? ""]);
}

export function mergeDeinflectedHits<E extends MergeableEntry>(
  hits: CandidateHit<E>[],
  source: string,
): MergedHit<E>[] {
  const byKey = new Map<string, MergedHit<E>>();
  // Duyệt theo thứ tự ứng viên: khi hoà lý do, `<` (không phải `<=`) giữ mục đã
  // đặt trước → ứng viên đến trước thắng. Nhờ vậy song song hoá không đổi kết
  // quả so với vòng lặp tuần tự, miễn `hits` giữ đúng thứ tự ứng viên.
  for (const hit of hits) {
    for (const entry of hit.entries) {
      const key = termReadingKey(entry);
      const prev = byKey.get(key);
      if (!prev || hit.reasons.length < prev.reasons.length) {
        byKey.set(key, { entry, reasons: hit.reasons, source });
      }
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.reasons.length - b.reasons.length || (b.entry.score ?? 0) - (a.entry.score ?? 0),
  );
}
