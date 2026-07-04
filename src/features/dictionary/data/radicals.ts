// Nạp bảng bộ thủ (RADKFILE đã chuyển sang JSON). Lười tải: chỉ import khi người
// dùng mở bảng chọn bộ, để không phình bundle khởi động — Vite tách thành chunk
// riêng. Cache theo phiên vì dữ liệu tĩnh.
//
// Nguồn radical→kanji: RADKFILE của EDRDG (CC-BY-SA, http://www.edrdg.org/edrdg/
// licence.html); số nét: KANJIDIC2 (EDRDG). JSON giữ ký tự đại diện thô của
// radkfile — glyph radical kiểu jisho được remap khi nạp (domain applyJishoGlyphs).

import { applyJishoGlyphs, Radical, RadicalData } from "../domain/radicals";

/** Shape thô trong radkfile.json: bộ→kanji + kanji nhóm theo số nét. */
interface RawRadkfile {
  radicals: Radical[];
  map: Record<string, string>;
  strokeGroups: Record<string, string>;
}

let cache: Promise<RadicalData> | null = null;

/** Trải strokeGroups (số nét → chuỗi kanji) thành kanji → số nét để tra nhanh. */
function flattenStrokes(groups: Record<string, string>): Record<string, number> {
  const strokes: Record<string, number> = {};
  for (const [count, kanji] of Object.entries(groups)) {
    for (const k of kanji) strokes[k] = Number(count);
  }
  return strokes;
}

export function loadRadicalData(): Promise<RadicalData> {
  if (!cache) {
    cache = import("./radkfile.json").then((m) => {
      const raw = (m.default ?? m) as unknown as RawRadkfile;
      return applyJishoGlyphs({ radicals: raw.radicals, map: raw.map, strokes: flattenStrokes(raw.strokeGroups) });
    });
  }
  return cache;
}
