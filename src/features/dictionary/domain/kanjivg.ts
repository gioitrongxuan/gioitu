// Đọc file SVG KanjiVG thành danh sách nét vẽ theo thứ tự. Parse bằng regex
// thay vì DOMParser để logic thuần chạy được trong test node; cấu trúc file
// KanjiVG đủ đều đặn cho việc này: mỗi nét là một <path d="M…"/> và thứ tự
// phần tử trong file chính là thứ tự viết.

export interface KanjiStroke {
  /** Path data (thuộc tính d) của nét. */
  d: string;
  /** Điểm đặt bút (toạ độ lệnh M đầu tiên) — nơi vẽ chấm khởi bút. */
  startX: number;
  startY: number;
}

/** KanjiVG vẽ trong hệ toạ độ vuông 109×109. */
export const KANJIVG_SIZE = 109;

/** Tên file KanjiVG của một chữ: codepoint hex 5 chữ số (vd 食 → "098df.svg"). */
export function kanjiVgFilename(kanji: string): string | null {
  const cp = kanji.codePointAt(0);
  if (cp == null) return null;
  return cp.toString(16).padStart(5, "0") + ".svg";
}

const PATH_RE = /<path\b[^>]*\bd="([^"]+)"/g;
const START_RE = /^[Mm]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/;

/** Toàn bộ nét theo thứ tự viết; path không đọc được điểm đặt bút thì bỏ qua. */
export function parseKanjiVgStrokes(svgText: string): KanjiStroke[] {
  const strokes: KanjiStroke[] = [];
  for (const m of svgText.matchAll(PATH_RE)) {
    const d = m[1];
    const start = START_RE.exec(d);
    if (!start) continue;
    strokes.push({ d, startX: parseFloat(start[1]), startY: parseFloat(start[2]) });
  }
  return strokes;
}
