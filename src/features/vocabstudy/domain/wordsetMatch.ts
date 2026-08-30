// Sàng một bộ từ nhập ngoài: ghép mỗi từ trong bộ với vốn từ của người dùng để
// biết từ nào **đã biết rồi**. Hàm thuần, không I/O, `now` do caller truyền.
//
// Khác `applyProgress` (vocablist.ts) đúng một chỗ, nhưng là chỗ quyết định:
// danh sách nhập từ ngoài không dùng cùng quy ước chính tả với vốn từ của người
// dùng. 食べる/たべる, 引っ越し/引越し, 見た/見る — cùng một từ, khác mặt chữ. So
// khớp chính xác thì bộ N1 hiện ra "chưa biết 100%" dù người ta đã thuộc cả trăm
// từ trong đó, tức là tính năng vô dụng.
//
// Nên khớp theo **thang bậc, có kèm độ tin cậy**:
//   1. mặt chữ trùng đúng                                  → chắc
//   2. trùng sau chuẩn hoá (NFKC, bỏ ・/khoảng trắng, lowercase) → chắc
//   3. trùng qua cách đọc (fold katakana → hiragana)        → NGỜ
//   4. trùng khung kanji (khác okurigana), ≥2 kanji         → NGỜ
//   5. trùng sau khi chia ngược động từ/tính từ             → NGỜ
// Bậc 1–2 được phép tự ẩn khỏi lưới. Bậc 3–5 thì KHÔNG: đồng âm khác nghĩa
// (はし cầu/đũa) mà tự ẩn là âm thầm giấu mất một từ người dùng chưa hề biết, và
// họ sẽ không bao giờ phát hiện ra. Chúng dồn vào nhóm "có thể đã biết" để duyệt
// bằng mắt một lần.

import { VocabEntry } from "@/shared/types";
import { katakanaToHiragana, isCodePointKanji } from "@/shared/japanese";
import { candidates } from "@/features/dictionary/domain/deinflect";
import { classify, VocabCell, VocabListWord, VocabProgress } from "./vocablist";

/** Độ tin cậy của một lần ghép: `exact` được tự ẩn, `loose` phải người duyệt. */
export type MatchKind = "exact" | "loose";

/** Một ô trong lưới sàng: như `VocabCell`, thêm độ tin cậy của lần ghép. */
export interface SieveCell extends VocabCell {
  /** Vắng khi không ghép được với entry nào (từ chưa biết). */
  match?: MatchKind;
}

/** Bảng tra vốn từ của người dùng, dựng một lần cho cả bộ (O(n + m)). */
export interface KnownIndex {
  exact: Map<string, VocabEntry>;
  /** Chuẩn hoá mặt chữ → entry. */
  norm: Map<string, VocabEntry>;
  /** Cách đọc (đã fold về hiragana) → entry. */
  kana: Map<string, VocabEntry>;
  /** Khung kanji (bỏ hết kana) → entry; chỉ chứa khung từ 2 kanji trở lên. */
  skeleton: Map<string, VocabEntry>;
}

/** Khoá có kèm ngôn ngữ: một bộ từ chỉ một cặp, nhưng vốn từ thì đủ mọi ngôn ngữ. */
function langKey(lang: string, value: string): string {
  return `${lang}\u0000${value}`;
}

/**
 * Chuẩn hoá mặt chữ để so khớp (KHÔNG dùng để hiển thị): NFKC gộp ký tự toàn/nửa
 * rộng, rồi bỏ những dấu chỉ để trang trí trong danh sách chép về — khoảng trắng,
 * dấu chấm giữa của katakana (・), gạch nối. Latin thì hạ chữ thường.
 */
export function normalizeTerm(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\s・゠‐-‑–—~〜]/g, "")
    .toLowerCase();
}

/** Khoá cách đọc: chuẩn hoá rồi fold katakana về hiragana (アメリカ = あめりか). */
export function readingKey(text: string): string {
  return katakanaToHiragana(normalizeTerm(text));
}

/** Khung kanji của một từ: bỏ sạch kana, chỉ giữ chữ Hán (引っ越し → 引越). */
export function kanjiSkeleton(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFKC")) {
    if (isCodePointKanji(ch.codePointAt(0) ?? 0)) out += ch;
  }
  return out;
}

/**
 * Khung kanji chỉ đủ tin để ghép khi có **từ 2 chữ Hán trở lên**. Một chữ thì
 * khung là cái rổ: 見る/見せる/見つかる cùng khung 見, ghép vào nhau là sai.
 */
function usableSkeleton(text: string): string | null {
  const sk = kanjiSkeleton(text);
  return [...sk].length >= 2 ? sk : null;
}

/** Dựng bảng tra từ vốn từ của người dùng. Entry đã xoá (tombstone) bị bỏ qua. */
export function buildKnownIndex(entries: VocabEntry[]): KnownIndex {
  const index: KnownIndex = { exact: new Map(), norm: new Map(), kana: new Map(), skeleton: new Map() };
  for (const e of entries) {
    if (e.deleted_at != null) continue;
    const lang = e.term_lang;
    // `set` chỉ khi chưa có: entry đầu tiên thắng, để một biến thể chính tả hiếm
    // không hất mất entry khớp thẳng của cùng khoá.
    setOnce(index.exact, langKey(lang, e.term), e);
    setOnce(index.norm, langKey(lang, normalizeTerm(e.term)), e);
    if (e.reading) setOnce(index.kana, langKey(lang, readingKey(e.reading)), e);
    else setOnce(index.kana, langKey(lang, readingKey(e.term)), e);
    const sk = usableSkeleton(e.term);
    if (sk) setOnce(index.skeleton, langKey(lang, sk), e);
  }
  return index;
}

function setOnce<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (!map.has(key)) map.set(key, value);
}

/** Kết quả ghép một từ của bộ với vốn từ người dùng. */
export interface WordMatch {
  entry: VocabEntry;
  kind: MatchKind;
}

/**
 * Ghép một từ trong bộ với vốn từ, theo thang bậc ở đầu file. Trả về `undefined`
 * khi không bậc nào khớp — đó là từ người dùng chưa biết.
 */
export function matchWord(word: VocabListWord, index: KnownIndex): WordMatch | undefined {
  const lang = word.term_lang;
  const k = (value: string) => langKey(lang, value);

  // Bậc 1–2: mặt chữ. Vẫn phải hạ xuống "ngờ" khi hai bên cùng khai cách đọc mà
  // lại khác nhau — đó là đồng âm dị nghĩa viết giống hệt (辛い からい/つらい), và
  // khoá SRS `(term, term_lang)` không có chỗ để phân biệt chúng.
  const exact = index.exact.get(k(word.term)) ?? index.norm.get(k(normalizeTerm(word.term)));
  if (exact) return { entry: exact, kind: readingsDisagree(word, exact) ? "loose" : "exact" };

  // Bậc 3: cách đọc. Cả hai chiều — bộ ghi kanji còn người dùng thuộc dạng kana,
  // hoặc ngược lại.
  const byReading =
    (word.reading ? index.kana.get(k(readingKey(word.reading))) : undefined) ??
    index.kana.get(k(readingKey(word.term))) ??
    (word.reading ? index.norm.get(k(normalizeTerm(word.reading))) : undefined);
  if (byReading) return { entry: byReading, kind: "loose" };

  // Bậc 4: khác okurigana (引っ越し ↔ 引越し).
  const sk = usableSkeleton(word.term);
  const bySkeleton = sk ? index.skeleton.get(k(sk)) : undefined;
  if (bySkeleton) return { entry: bySkeleton, kind: "loose" };

  // Bậc 5: bộ chép về còn ở dạng chia (見た, running). Chạy sau cùng vì đắt nhất
  // và chỉ cho những từ đã trượt hết các bậc trên.
  for (const cand of candidates(word.term, lang)) {
    const hit = index.norm.get(k(normalizeTerm(cand.term)));
    if (hit) return { entry: hit, kind: "loose" };
  }
  return undefined;
}

/** Hai bên cùng khai cách đọc nhưng khác nhau → cùng mặt chữ, khác từ. */
function readingsDisagree(word: VocabListWord, entry: VocabEntry): boolean {
  if (!word.reading || !entry.reading) return false;
  return readingKey(word.reading) !== readingKey(entry.reading);
}

/**
 * Sàng cả bộ: mỗi từ ghép với vốn từ rồi phân trạng thái học như lưới thường.
 * Dòng trùng (cùng term + reading + term_lang) chỉ giữ ô đầu.
 */
export function applySieve(words: VocabListWord[], entries: VocabEntry[], now: number): SieveCell[] {
  const index = buildKnownIndex(entries);
  const seen = new Set<string>();
  const cells: SieveCell[] = [];
  for (const word of words) {
    // Khoá khử trùng phải GỒM CẢ cách đọc, đúng nguyên tắc của store `terms`:
    // 分別 ぶんべつ ("phân loại") và 分別 ふんべつ ("suy xét") là hai từ khác nhau,
    // gộp theo mặt chữ là lặng lẽ nuốt mất một từ. Bộ JLPT N1 có 5 cặp như vậy
    // (分別・市場・心中・目下・筋) và trước đây chúng chỉ hiện ra 5 ô thay vì 10.
    const key = langKey(word.term_lang, `${word.term}\u0000${word.reading ?? ""}`);
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = matchWord(word, index);
    cells.push({
      word,
      entry: hit?.entry,
      progress: classify(hit?.entry, now),
      ...(hit ? { match: hit.kind } : {}),
    });
  }
  return cells;
}

/** Số ô ghép được nhưng chưa đủ chắc — nhóm "có thể đã biết", cần người duyệt. */
export function countUncertain(cells: SieveCell[]): number {
  let n = 0;
  for (const c of cells) if (c.match === "loose") n += 1;
  return n;
}

/**
 * Lọc ô để hiển thị. Hai bộ lọc chồng nhau, cố ý tách bạch:
 *  - `hideKnown` — ẩn phần **chắc chắn đã thuộc**. Đây là "quét từ đã biết đi";
 *    ô ngờ không bao giờ bị ẩn ở đây, chúng phải được duyệt trước.
 *  - `filter`    — bộ lọc trạng thái sẵn có, cộng thêm giá trị "uncertain".
 */
export function visibleCells(
  cells: SieveCell[],
  filter: VocabProgress | "all" | "uncertain",
  hideKnown: boolean,
): SieveCell[] {
  return cells.filter((c) => {
    if (hideKnown && c.progress === "learned" && c.match === "exact") return false;
    if (filter === "all") return true;
    if (filter === "uncertain") return c.match === "loose";
    return c.progress === filter;
  });
}
