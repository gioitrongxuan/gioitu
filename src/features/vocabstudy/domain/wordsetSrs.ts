// Chọn mẻ cho một phiên ôn của MỘT bộ từ.
//
// Bộ từ không có lịch ôn riêng: từ nào được đưa vào học thì thành `VocabEntry`
// như mọi thẻ khác, dùng chung một vốn từ và đi chung đường đồng bộ. Ở đây chỉ
// làm hai việc thuần: đếm xem bộ này còn gì để học, và chọn ra hàng đợi.
//
// Cố ý KHÔNG tự ghép lại từ với vốn từ: lưới đã ghép rồi và đang bày kết quả ấy
// ra màn hình (`applySieve` → `SieveCell.entry`). Ghép lần hai bằng luật riêng
// là chuyện lưới nói một đằng, hàng đợi lấy một nẻo mà không ai giải thích được.

import { VocabEntry } from "@/shared/types";
import { newWordsetEntry } from "@/features/review/domain/lookup";
import { SieveCell } from "./wordsetMatch";
import { WordsetWord } from "../data/wordsets";
import { splitExample } from "./wordset";

/** Bộ này còn gì để học. */
export interface WordsetStudyCounts {
  /** Thẻ của bộ đang đến hạn ôn — gồm cả thẻ vốn sinh ra từ tra cứu. */
  due: number;
  /** Từ chưa chắc đã biết: chưa có thẻ nào, hoặc chỉ ghép được kiểu *ngờ* với
   *  vốn từ. Xem `isInVocabulary`. */
  unstarted: number;
}

/** Số từ mới gợi ý sẵn cho một phiên. Bằng mặc định của Anki — đủ để tiến đều
 *  mà không dồn thành một núi thẻ đến hạn ba ngày sau. */
export const DEFAULT_NEW_PER_SESSION = 20;

/** Trần số từ mới cho MỘT phiên. Học 200 từ mới liền một lúc thì hôm sau nhận
 *  đủ 200 thẻ đến hạn, và đó là cách người ta bỏ cuộc. */
export const MAX_NEW_PER_SESSION = 200;

/**
 * Ô này đã CHẮC CHẮN nằm trong vốn từ chưa.
 *
 * Chỉ ghép bậc 1–2 (mặt chữ trùng đúng, hoặc trùng sau chuẩn hoá) mới tính. Bậc
 * 3–5 — trùng cách đọc, trùng khung kanji, trùng sau khi chia ngược — là ghép
 * *ngờ*, và `wordsetMatch.ts` đã nói rõ chúng không được tự coi là cùng một từ:
 * 箸 (đũa) với 橋 (cầu) cùng đọc はし.
 *
 * Ranh giới này quyết định cả hai đầu của phiên học, và sai ở đây thì sai cả hai:
 *  - Kể ghép ngờ là "đã biết" → thẻ 橋 bị lôi vào phiên "học bộ N1", chiếm chỗ
 *    của từ N1 thật. Với một vốn từ lớn thì cả phiên đầy từ lạ.
 *  - Kể ghép ngờ là "đã biết" → 箸 không bao giờ được đem ra dạy, im lặng biến
 *    mất khỏi bộ.
 *
 * Nên: chưa chắc thì coi như CHƯA biết. Dạy nhầm một từ đã thuộc thì người học
 * chấm "Dễ" một cái là xong; bỏ sót một từ chưa biết thì không ai phát hiện ra.
 */
function isInVocabulary(cell: SieveCell): boolean {
  return cell.match === "exact";
}

export function studyCounts(cells: SieveCell[]): WordsetStudyCounts {
  let due = 0;
  let unstarted = 0;
  for (const c of cells) {
    if (!isInVocabulary(c)) unstarted += 1;
    else if (c.progress === "due") due += 1;
  }
  return { due, unstarted };
}

/**
 * Những ô chưa chắc đã biết, theo ĐÚNG thứ tự trong bộ — tức thứ tự bài của giáo
 * trình. Không xáo trộn: bộ Tango dạy theo chủ đề, học lộn xộn là mất một nửa
 * giá trị.
 */
export function unstartedCells(cells: SieveCell[], limit: number): SieveCell[] {
  if (limit <= 0) return [];
  return cells.filter((c) => !isInVocabulary(c)).slice(0, limit);
}

/** Thẻ đến hạn của bộ — chỉ những ô ghép CHẮC, xem `isInVocabulary`. */
export function dueEntriesOf(cells: SieveCell[]): VocabEntry[] {
  return cells.flatMap((c) => (isInVocabulary(c) && c.progress === "due" && c.entry ? [c.entry] : []));
}

/**
 * Dựng thẻ mới cho một ô của lưới, chép sang nội dung mà bộ từ mang theo.
 *
 * Chép chứ không tham chiếu: bộ từ và media của nó chỉ nằm trên máy này, còn thẻ
 * thì đi khắp các thiết bị. Không chép thì mở app trên điện thoại sẽ thấy một
 * thẻ trống rỗng chỉ có mặt chữ.
 */
export function buildWordsetEntry(
  cell: SieveCell,
  row: WordsetWord | undefined,
  setId: string,
  userId: string,
  nativeLang: string,
  now: number,
): VocabEntry {
  const gloss = row?.gloss ?? "";
  return newWordsetEntry(
    {
      user_id: userId,
      term: cell.word.term,
      term_lang: cell.word.term_lang,
      native_lang: nativeLang,
      // `meaning` nhận được cả chuỗi thường lẫn JSON (xem `meaningToLines`), nên
      // nghĩa một dòng của bộ từ đưa thẳng vào được.
      meaning: gloss,
      ...(cell.word.reading ? { reading: cell.word.reading } : {}),
      ...(row?.example ? { example: row.example } : {}),
    },
    setId,
    now,
  );
}

/**
 * Thẻ mới có đủ chất để ôn không.
 *
 * Không nghĩa mà cũng không câu ví dụ thì mặt sau trống trơn — lật ra không có
 * gì để đối chiếu, thẻ ấy vô dụng. Lọc ở đây rồi báo số bị bỏ, hơn là để người
 * dùng gặp thẻ trắng giữa phiên.
 */
export function isTeachable(row: WordsetWord | undefined): boolean {
  if (!row) return false;
  if (row.gloss && row.gloss.trim() !== "") return true;
  return !!row.example && splitExample(row.example).sentence !== "";
}
