// Chọn ngôn ngữ segment (Nhật / Anh / Cả hai) — dùng ở Word Cloud, "Đã thuộc"
// và hero "Hôm nay" (đều đọc/ghi cùng state cloudLang nên phải cùng UI).

import { CloudLang } from "../domain/wordcloud";

interface Props {
  lang: CloudLang;
  onLangChange: (lang: CloudLang) => void;
}

export function LangSelect({ lang, onLangChange }: Props) {
  return (
    <label className="sort-select">
      Ngôn ngữ
      <select value={lang} onChange={(e) => onLangChange(e.target.value as CloudLang)}>
        <option value="all">Cả hai</option>
        <option value="ja">Tiếng Nhật</option>
        <option value="en">Tiếng Anh</option>
      </select>
    </label>
  );
}
