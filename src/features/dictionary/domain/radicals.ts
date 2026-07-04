// Tra theo bộ thủ (multi-radical lookup kiểu RADKFILE / jisho): chọn nhiều bộ →
// các kanji chứa ĐỦ mọi bộ đã chọn. Logic thuần, không I/O: dữ liệu radkfile do
// caller nạp (data/radicals.ts) rồi truyền vào, nên test chạy được mà không cần
// tải asset. Ký tự bộ là ký tự đại diện theo radkfile; việc lọc chỉ dựa trên
// bảng bộ→kanji nên độc lập với glyph hiển thị.

export interface Radical {
  /** Ký tự bộ (đại diện theo radkfile). */
  r: string;
  /** Số nét — dùng để nhóm bảng chọn. */
  s: number;
}

export interface RadicalData {
  /** Danh sách bộ theo thứ tự radkfile (đã sắp theo số nét). */
  radicals: Radical[];
  /** Bộ → chuỗi các kanji chứa bộ đó. */
  map: Record<string, string>;
}

/** Các bộ nhóm theo số nét, giữ nguyên thứ tự xuất hiện trong từng nhóm. */
export interface RadicalGroup {
  strokes: number;
  radicals: Radical[];
}

/**
 * Kanji chứa TẤT CẢ các bộ đã chọn (giao các danh sách bộ→kanji). Chưa chọn bộ
 * nào → rỗng. Giao bắt đầu từ danh sách ngắn nhất để dừng sớm.
 */
export function matchingKanji(data: RadicalData, selected: readonly string[]): string[] {
  if (selected.length === 0) return [];
  const lists = selected.map((r) => data.map[r] ?? "");
  if (lists.some((l) => l.length === 0)) return [];
  // Cơ sở là danh sách ngắn nhất; các bộ còn lại thành Set để kiểm tra thành viên.
  const base = lists.reduce((a, b) => (a.length <= b.length ? a : b));
  const others = lists.filter((l) => l !== base).map((l) => new Set(l));
  const result: string[] = [];
  for (const ch of base) {
    if (others.every((set) => set.has(ch))) result.push(ch);
  }
  return result;
}

/**
 * Các bộ có thể chọn tiếp mà vẫn còn kết quả (để bảng chọn làm mờ phần vô nghĩa,
 * kiểu jisho). Chưa chọn gì → mọi bộ đều chọn được. Đã chọn → chỉ những bộ còn
 * chung ít nhất một kanji với tập kết quả hiện tại. Các bộ đã chọn luôn nằm trong
 * tập trả về.
 */
export function availableRadicals(data: RadicalData, selected: readonly string[]): Set<string> {
  if (selected.length === 0) return new Set(data.radicals.map((x) => x.r));
  const matches = matchingKanji(data, selected);
  const matchSet = new Set(matches);
  const available = new Set<string>(selected);
  if (matchSet.size === 0) return available;
  for (const { r } of data.radicals) {
    if (available.has(r)) continue;
    const list = data.map[r] ?? "";
    for (const ch of list) {
      if (matchSet.has(ch)) {
        available.add(r);
        break;
      }
    }
  }
  return available;
}

/** Nhóm các bộ theo số nét (giữ thứ tự radkfile) cho bảng chọn. */
export function groupByStrokes(radicals: readonly Radical[]): RadicalGroup[] {
  const groups: RadicalGroup[] = [];
  for (const radical of radicals) {
    const last = groups[groups.length - 1];
    if (last && last.strokes === radical.s) last.radicals.push(radical);
    else groups.push({ strokes: radical.s, radicals: [radical] });
  }
  return groups;
}
