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

/** Nạp chunk radkfile.json (lười tải). Tách ra để test được nhánh lỗi mà không
 * đụng dynamic import thật. */
type RadkfileImport = () => Promise<{ default?: RawRadkfile } | RawRadkfile>;

export function loadRadicalData(importer: RadkfileImport = () => import("./radkfile.json")): Promise<RadicalData> {
  if (!cache) {
    cache = importer()
      .then((m) => {
        const raw = ("default" in m ? m.default : m) as RawRadkfile;
        return applyJishoGlyphs({ radicals: raw.radicals, map: raw.map, strokes: flattenStrokes(raw.strokeGroups) });
      })
      .catch((err) => {
        // Đừng ghim promise lỗi (VD chunk chưa cache mà đang offline) — nếu giữ
        // lại thì mọi lần mở bảng bộ thủ sau đều treo. Xoá cache để lần sau tải lại.
        cache = null;
        throw err;
      });
  }
  return cache;
}
