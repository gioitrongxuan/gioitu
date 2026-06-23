// Shared cloud view controls: pick the language segment (Nhật / Anh / Cả hai)
// and the time grouping (Không / Ngày / Tháng / Năm). Used by the home FilterBar
// and the "Đã thuộc" page so both maps read the same way.

import { CloudLang, TimeGrouping } from "../domain/wordcloud";

interface Props {
  lang: CloudLang;
  grouping: TimeGrouping;
  onLangChange: (lang: CloudLang) => void;
  onGroupingChange: (grouping: TimeGrouping) => void;
}

export function CloudViewControls({ lang, grouping, onLangChange, onGroupingChange }: Props) {
  return (
    <>
      <label className="sort-select">
        Ngôn ngữ
        <select value={lang} onChange={(e) => onLangChange(e.target.value as CloudLang)}>
          <option value="all">Cả hai</option>
          <option value="ja">Tiếng Nhật</option>
          <option value="en">Tiếng Anh</option>
        </select>
      </label>
      <label className="sort-select">
        Nhóm theo
        <select value={grouping} onChange={(e) => onGroupingChange(e.target.value as TimeGrouping)}>
          <option value="none">Không</option>
          <option value="day">Ngày</option>
          <option value="month">Tháng</option>
          <option value="year">Năm</option>
        </select>
      </label>
    </>
  );
}
