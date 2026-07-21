// "Thêm nhanh" — logic thuần cho luồng lượm từ khi đang lướt web. Một từ bắt được
// (bookmarklet trên máy tính / Share Target trên điện thoại) tới app dưới dạng
// văn bản trần; ở đây chỉ đoán cặp ngôn ngữ mặc định từ chữ viết. Dựng entry và
// khử trùng vẫn dùng chung domain/customEntry — không nhân bản.

import { LangPair, pairById, pairId } from "@/shared/languages";

// Có mặt hiragana, katakana hoặc kanji ⇒ coi là tiếng Nhật. Không cần bao phủ
// mọi khối Unicode CJK hiếm — chỉ cần tách "có chữ Nhật" khỏi "toàn chữ Latin"
// để chọn cặp mặc định; người dùng đổi lại được trong form.
const JAPANESE = /[぀-ゟ゠-ヿ㐀-鿿豈-﫿]/;

/**
 * Đoán cặp ngôn ngữ cho một từ lượm được: có chữ Nhật → Nhật→Việt, còn lại
 * (chữ Latin) → Anh→Việt. Đích luôn là tiếng Việt vì đây là sổ tay của người
 * học người Việt; muốn khác thì đổi trong form.
 */
export function guessPairForText(text: string): LangPair {
  const source = JAPANESE.test(text) ? "ja" : "en";
  return pairById(pairId(source, "vi"));
}
