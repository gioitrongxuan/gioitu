// Nội dung mặt TRƯỚC của thẻ ôn. Thuần: chỉ quyết định bày gì, không phụ thuộc
// React/DOM, test độc lập.
//
// Ba chế độ, mỗi chế độ hỏi một câu hỏi khác nhau:
//   term     — thấy TỪ, nhớ lại nghĩa (mặc định).
//   meaning  — thấy NGHĨA, nhớ lại từ (chế độ đảo chiều, BACKLOG GĐ3 #164).
//   sentence — thấy CÂU chứa từ, nhớ lại cách đọc và nghĩa của từ trong ngữ
//              cảnh ấy. Đây là lối của các bộ Tango: từ đứng một mình thì nhớ
//              máy móc, nằm trong câu mới ra cách dùng.
//
// Mọi chế độ đều rơi về mặt từ khi thiếu nguyên liệu — mặt trước trắng thì không
// ôn được gì.

import { meaningToLines } from "@/shared/meaning";

export type FrontMode = "term" | "meaning" | "sentence";

/** Nội dung mặt trước thẻ ôn. */
export type CardFront =
  | { kind: "term"; text: string }
  | { kind: "meaning"; lines: string[] }
  /** Câu ví dụ (chưa kèm bản dịch) và từ cần nhận ra trong đó, để tô đậm. */
  | { kind: "sentence"; sentence: string; term: string };

/** Ngăn giữa câu và bản dịch trong `VocabEntry.example` — cùng quy ước với Từ
 *  điển cá nhân và bộ từ nhập ("câu :: bản dịch"). */
const EXAMPLE_SEP = "::";

/**
 * Mặt trước theo chế độ.
 *
 * Chế độ `sentence` chỉ lấy phần CÂU, bỏ bản dịch: bản dịch nằm sẵn trên mặt
 * trước thì thẻ tự trả lời hộ, còn gì để nhớ nữa.
 */
export function cardFront(
  mode: FrontMode,
  card: { term: string; meaning: string; example?: string },
): CardFront {
  if (mode === "meaning") {
    const lines = meaningToLines(card.meaning);
    if (lines.length > 0) return { kind: "meaning", lines };
  }
  if (mode === "sentence") {
    const sentence = sourceSentence(card.example);
    // Câu phải thật sự CHỨA từ thì tô đậm mới có nghĩa, và người học mới có
    // manh mối để nhận ra. Không chứa (câu chia ở dạng khác, hoặc ví dụ lạc đề)
    // thì mặt từ trung thực hơn.
    if (sentence && sentence.includes(card.term)) return { kind: "sentence", sentence, term: card.term };
  }
  return { kind: "term", text: card.term };
}

/** Phần câu nguồn của một ví dụ "câu :: bản dịch". */
function sourceSentence(example: string | undefined): string {
  if (!example) return "";
  const at = example.indexOf(EXAMPLE_SEP);
  return (at < 0 ? example : example.slice(0, at)).trim();
}

/**
 * Chia một câu quanh từ cần tô đậm: trước · từ · sau.
 *
 * Trả về mảng đoạn thay vì HTML để `ui/` tự chọn cách nhấn (đậm, màu, ruby) —
 * `domain/` không dựng thẻ HTML.
 */
export function highlightTerm(sentence: string, term: string): { text: string; isTerm: boolean }[] {
  if (!term) return [{ text: sentence, isTerm: false }];
  const parts: { text: string; isTerm: boolean }[] = [];
  let at = 0;
  for (;;) {
    const hit = sentence.indexOf(term, at);
    if (hit < 0) break;
    if (hit > at) parts.push({ text: sentence.slice(at, hit), isTerm: false });
    parts.push({ text: term, isTerm: true });
    at = hit + term.length;
  }
  if (at < sentence.length) parts.push({ text: sentence.slice(at), isTerm: false });
  return parts;
}
