// Chuẩn hoá Unicode cho văn bản (Issue #267). Tiếng Việt có dấu tồn tại ở hai
// dạng Unicode hợp lệ nhưng KHÔNG bằng nhau theo từng byte:
//   • NFC (dựng sẵn) — "ắ" là một code point U+1EAF,
//   • NFD (tổ hợp)   — "ắ" là "a" + U+0306 + U+0301.
// Chép text từ macOS (Finder, Safari) hay từ dữ liệu cào web (Mazii/Yomitan lẫn
// lộn cả hai dạng) thường ra NFD. Hai hệ quả thấy được:
//   1. Hiển thị: font không có glyph tổ hợp sẽ đẩy dấu ra thành ký tự riêng —
//      "Sắp xếp" render thành "Să ´ p xê ´ p".
//   2. So khớp: khoá `terms` và mọi phép `includes`/so chuỗi đều trật dù người
//      dùng thấy hai chuỗi giống hệt nhau.
// Vì vậy ta ép NFC ở hai biên: lúc văn bản vào hệ (truy vấn tra cứu, từ người
// dùng tự soạn) và lúc văn bản ra màn hình (glossary từ điển đã nhập).

/**
 * Ép một chuỗi về NFC. Idempotent và không đổi nghĩa với chuỗi đã đúng NFC (kể
 * cả kana/kanji — NFC không gộp dakuten rời của tiếng Nhật thành ký tự khác
 * nghĩa), nên gọi thoải mái ở biên mà không cần biết dữ liệu đến từ đâu.
 */
export function toNfc(s: string): string {
  return s.normalize("NFC");
}

/** Như `toNfc` nhưng khoan dung với `undefined`/`null` ở biên dữ liệu. */
export function toNfcOrEmpty(s: string | undefined | null): string {
  return s ? s.normalize("NFC") : "";
}
