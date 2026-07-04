// Tra theo bộ thủ (multi-radical lookup kiểu RADKFILE / jisho): chọn nhiều bộ →
// các kanji chứa ĐỦ mọi bộ đã chọn, sắp theo số nét (đơn giản trước) như jisho.
// Logic thuần, không I/O: dữ liệu radkfile do caller nạp (data/radicals.ts) rồi
// truyền vào, nên test chạy được mà không cần tải asset.

export interface Radical {
  /** Ký tự bộ (glyph hiển thị kiểu jisho sau khi remap). */
  r: string;
  /** Số nét — dùng để nhóm bảng chọn. */
  s: number;
}

export interface RadicalData {
  /** Danh sách bộ theo thứ tự radkfile (đã sắp theo số nét). */
  radicals: Radical[];
  /** Bộ → chuỗi các kanji chứa bộ đó. */
  map: Record<string, string>;
  /** Kanji → số nét (KANJIDIC), để sắp kết quả giống jisho. */
  strokes: Record<string, number>;
}

/** Các bộ nhóm theo số nét, giữ nguyên thứ tự xuất hiện trong từng nhóm. */
export interface RadicalGroup {
  strokes: number;
  radicals: Radical[];
}

/**
 * Bộ radkfile có "ký tự đại diện" → glyph radical chuẩn mà jisho hiển thị (đối
 * chiếu vị trí với danh sách bộ tại jisho.org/docs). 22 bộ; lọc kanji không phụ
 * thuộc glyph này nên chỉ ảnh hưởng phần hiển thị.
 */
export const JISHO_GLYPHS: Record<string, string> = {
  "化": "⺅", "个": "𠆢", "并": "丷", "刈": "⺉", "乞": "𠂉",
  "込": "⻌", "尚": "⺌", "忙": "⺖", "扎": "⺘", "汁": "⺡",
  "犯": "⺨", "艾": "⺾", "邦": "⻏", "阡": "⻖", "老": "⺹",
  "杰": "⺣", "礼": "⺭", "疔": "疒", "禹": "禸", "初": "⻂",
  "買": "⺲", "滴": "啇",
};

/** Đổi ký tự đại diện radkfile sang glyph radical của jisho (thuần, giữ kanji). */
export function applyJishoGlyphs(data: RadicalData): RadicalData {
  const glyph = (r: string) => JISHO_GLYPHS[r] ?? r;
  return {
    radicals: data.radicals.map(({ r, s }) => ({ r: glyph(r), s })),
    map: Object.fromEntries(Object.entries(data.map).map(([r, kanji]) => [glyph(r), kanji])),
    strokes: data.strokes,
  };
}

/**
 * Kanji chứa TẤT CẢ các bộ đã chọn (giao các danh sách bộ→kanji), sắp theo số
 * nét tăng dần (kiểu jisho); các kanji cùng số nét giữ thứ tự radkfile. Chưa
 * chọn bộ nào → rỗng.
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
  // Sort ổn định (ES2019+): cùng số nét giữ nguyên thứ tự giao ở trên.
  return result.sort((a, b) => (data.strokes[a] ?? 99) - (data.strokes[b] ?? 99));
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
