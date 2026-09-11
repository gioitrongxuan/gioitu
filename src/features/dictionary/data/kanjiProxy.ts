// Phần I/O của luồng chiết tự hộ overlay ngoài trang: rút chữ Hán khỏi phần bôi
// đen, hỏi `/api/kanji` một lượt rồi giao cho domain/kanjiProxy dựng payload.
//
// Chỉ có MỘT nguồn (bảng kanji trên server) — khác luồng tra nghĩa: dữ liệu cấu
// tạo chữ chưa từng nằm trong từ điển tải về IndexedDB, nên không có nhánh
// "trên máy trước" nào để chọn ở đây.

import { LangPair } from "@/shared/languages";
import {
  buildKanjiReply,
  hanCharsOf,
  KanjiProxyReply,
  kanjiPairFor,
} from "../domain/kanjiProxy";
import { fetchKanjiBreakdownResult } from "./kanjiApi";

/** Chiết tự hộ overlay: một request cho mọi chữ Hán trong phần bôi đen. */
export async function runProxyKanji(text: string, pair: LangPair): Promise<KanjiProxyReply> {
  const chars = hanCharsOf(text);
  // Không có chữ Hán nào thì chẳng có gì để hỏi server — trả lời rỗng ngay, để
  // overlay nói "phần bôi đen không có chữ Hán" mà không tốn một lượt gọi mạng.
  if (chars.length === 0) return buildKanjiReply(text, chars, []);
  const target = kanjiPairFor(pair);
  const { kanji, error } = await fetchKanjiBreakdownResult(chars.join(""), target.source, target.target);
  return buildKanjiReply(text, chars, kanji, error ?? undefined);
}
