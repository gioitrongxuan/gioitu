// Chế độ đảo chiều (BACKLOG GĐ3, #164): mặt trước thẻ ôn hiện NGHĨA, người học
// nhớ lại TỪ — mặt sau mới lộ từ + cách đọc. Thuần: chỉ quyết định nội dung
// mặt trước theo chế độ, không phụ thuộc React/DOM, test độc lập.

import { meaningToLines } from "@/shared/meaning";

/** Nội dung mặt trước thẻ ôn: từ (mặc định) hoặc các dòng nghĩa (đảo chiều). */
export type CardFront =
  | { kind: "term"; text: string }
  | { kind: "meaning"; lines: string[] };

/**
 * Mặt trước theo chế độ. Đảo chiều mà thẻ không có nghĩa đọc được (payload
 * rỗng/hỏng) thì rơi về mặt từ — mặt trước trắng thì không ôn được gì.
 */
export function cardFront(
  reversed: boolean,
  card: { term: string; meaning: string },
): CardFront {
  if (reversed) {
    const lines = meaningToLines(card.meaning);
    if (lines.length > 0) return { kind: "meaning", lines };
  }
  return { kind: "term", text: card.term };
}
