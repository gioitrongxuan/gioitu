// Nét viết KanjiVG — tải SVG từ GitHub raw theo codepoint (cách jisho-open
// dùng), cache theo phiên vì dữ liệu tĩnh. Lỗi mạng / chữ không có file → null
// để UI ẩn gọn thay vì báo lỗi.

import { KanjiStroke, kanjiVgFilename, parseKanjiVgStrokes } from "../domain/kanjivg";

const KANJIVG_BASE = "https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/";

const cache = new Map<string, Promise<KanjiStroke[] | null>>();

export function fetchKanjiStrokes(kanji: string): Promise<KanjiStroke[] | null> {
  const file = kanjiVgFilename(kanji);
  if (!file) return Promise.resolve(null);
  let pending = cache.get(file);
  if (!pending) {
    pending = fetch(KANJIVG_BASE + file)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => {
        const strokes = text ? parseKanjiVgStrokes(text) : [];
        return strokes.length ? strokes : null;
      })
      .catch(() => null);
    cache.set(file, pending);
  }
  return pending;
}
