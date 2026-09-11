// Phần I/O của luồng chiết tự hộ overlay ngoài trang: rút chữ Hán khỏi phần bôi
// đen rồi hỏi `/api/kanji` theo BA LƯỢT, mỗi lượt một request gộp — lượt sau chỉ
// biết phải hỏi gì sau khi có kết quả lượt trước:
//   1. chính các chữ được bôi đen;
//   2. "chữ con" của chúng (bộ phận, phần nghĩa, phần âm) — để mỗi chữ con hiện
//      được Hán-Việt + nghĩa của chính nó, chứ không trơ mỗi cái glyph;
//   3. họ chữ cùng phần âm (danh sách nằm ở `keiseiPhonetic` của chữ làm phần
//      âm, nên chỉ biết được sau lượt 2).
//
// Chỉ có MỘT nguồn (bảng kanji trên server) — khác luồng tra nghĩa: dữ liệu cấu
// tạo chữ chưa từng nằm trong từ điển tải về IndexedDB, nên không có nhánh
// "trên máy trước" nào để chọn ở đây.

import { LangPair } from "@/shared/languages";
import {
  buildKanjiReply,
  familyCharsOf,
  hanCharsOf,
  KanjiProxyReply,
  kanjiPairFor,
  partCharsOf,
} from "../domain/kanjiProxy";
import { fetchKanjiBreakdownResult } from "./kanjiApi";

/** Chiết tự hộ overlay: một request cho mọi chữ Hán trong phần bôi đen. */
export async function runProxyKanji(text: string, pair: LangPair): Promise<KanjiProxyReply> {
  const chars = hanCharsOf(text);
  // Không có chữ Hán nào thì chẳng có gì để hỏi server — trả lời rỗng ngay, để
  // overlay nói "phần bôi đen không có chữ Hán" mà không tốn một lượt gọi mạng.
  if (chars.length === 0) return buildKanjiReply(text, chars, []);
  const { source, target } = kanjiPairFor(pair);

  const first = await fetchKanjiBreakdownResult(chars.join(""), source, target);
  // Lượt đầu hỏng là hỏng cả: không có gì để chú thích thì cũng không có thẻ nào.
  if (first.error) return buildKanjiReply(text, chars, [], first.error);

  const byLiteral = new Map(first.kanji.map((e) => [e.literal, e]));
  // Hai lượt sau chỉ làm dày thêm chú thích: hỏng thì thẻ vẫn đúng, chỉ là chữ
  // con trơ mặt chữ — nên nuốt lỗi ở đây thay vì bỏ cả kết quả đã có.
  const add = async (want: string[]) => {
    if (want.length === 0) return;
    const { kanji } = await fetchKanjiBreakdownResult(want.join(""), source, target);
    for (const entry of kanji) byLiteral.set(entry.literal, entry);
  };

  await add(partCharsOf(first.kanji));
  await add(familyCharsOf(first.kanji, byLiteral));

  return buildKanjiReply(text, chars, [...byLiteral.values()]);
}
