// Bộ mã tag gợi ý cho form sửa nghĩa: từ loại (POS) và nhãn cách dùng (misc).
// Chỉ chọn lọc những mã thông dụng để dropdown gọn — người dùng vẫn gõ tay được
// mã bất kỳ (mã lạ vẫn hiển thị trần, như Yomitan). Nhãn hiển thị lấy từ cùng
// bảng resolve mà kết quả tra dùng, nên chip trong form khớp chip ở chi tiết từ.

import { resolveTag } from "./tags";

export interface TagOption {
  code: string;
  /** Nhãn tiếng Việt để hiển thị trong danh sách chọn. */
  label: string;
}

/** Nhãn người-đọc cho một mã tag (rơi về chính mã nếu không biết). */
export function tagLabel(code: string): string {
  return resolveTag(code)?.name ?? code;
}

function options(codes: string[]): TagOption[] {
  return codes.map((code) => ({ code, label: tagLabel(code) }));
}

/** Từ loại thường gặp (JMdict). */
export const POS_OPTIONS: TagOption[] = options([
  "n", "n-adv", "n-suf", "n-pref", "pn", "adj", "adj-i", "adj-na", "adj-no",
  "adv", "aux", "aux-v", "conj", "cop", "ctr", "exp", "int", "num", "pref",
  "prt", "suf", "v1", "v5", "v5u", "v5k", "v5g", "v5s", "v5t", "v5n", "v5b",
  "v5m", "v5r", "vk", "vs", "vs-i", "vt", "vi",
]);

/** Nhãn cách dùng / sắc thái thường gặp. */
export const MISC_OPTIONS: TagOption[] = options([
  "uk", "abbr", "col", "sl", "vulg", "hon", "hum", "pol", "fam", "male", "fem",
  "on-mim", "yoji", "proverb", "id", "arch", "obs", "rare",
]);
