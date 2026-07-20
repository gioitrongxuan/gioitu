// Cách xếp kết quả tra để danh sách đọc được (#172). Tra thẳng (khớp headword /
// dạng chia) là kết quả chính; còn hai lượt quét chạy nền — gợi ý gần đúng
// (fuzzy) và khớp theo định nghĩa/nghĩa (viaDefinition) — là kết quả phụ. Khi
// gõ một cụm tiếng Việt ở cặp ja→vi, lượt khớp theo nghĩa có thể trả về rất
// nhiều từ; hiện đầy đủ từng thẻ (nghĩa + ảnh + bình luận + chữ Hán) làm danh
// sách dài không quét nổi, nên UI hiện kết quả phụ ở dạng gọn một dòng.

import type { DictEntry } from "@/shared/db";
import { glossaryToLines, sensesToLines } from "@/shared/structured-content";
import type { TermResult } from "../data/yomitan";

/** Kết quả phụ = gợi ý gần đúng hoặc khớp theo định nghĩa, không phải khớp thẳng. */
export function isSecondaryResult(res: TermResult): boolean {
  return res.fuzzy === true || res.viaDefinition === true;
}

export interface PartitionedResults {
  /** Khớp thẳng (headword / dạng chia) — hiện đầy đủ. */
  primary: TermResult[];
  /** Gợi ý gần đúng + khớp theo định nghĩa — hiện gọn, bấm để mở chi tiết. */
  secondary: TermResult[];
}

/**
 * Tách danh sách kết quả đã xếp hạng thành phần chính (hiện đầy đủ) và phần phụ
 * (hiện gọn). Giữ nguyên thứ tự: useLookup nối [khớp thẳng…, fuzzy…, viaDefinition…]
 * nên chỉ cần phân loại theo cờ, không cần xếp lại.
 */
export function partitionResults(results: TermResult[]): PartitionedResults {
  const primary: TermResult[] = [];
  const secondary: TermResult[] = [];
  for (const res of results) (isSecondaryResult(res) ? secondary : primary).push(res);
  return { primary, secondary };
}

/**
 * Một dòng nghĩa gọn cho thẻ kết quả rút gọn — giống ô gợi ý khi gõ. Ưu tiên
 * senses (từ điển server dùng senses), lùi về definitions (Yomitan trên máy).
 * Nối vài nghĩa bằng " · " rồi để CSS cắt bớt bằng ellipsis khi quá dài.
 */
export function resultGloss(entry: DictEntry): string {
  const lines = entry.senses?.length ? sensesToLines(entry.senses) : glossaryToLines(entry.definitions);
  return lines.join(" · ");
}
