// Shared cloud view controls: pick the language segment (Nhật / Anh / Cả hai)
// and the grouping (Không / Trí nhớ / Ngày / Tháng / Năm). Used by the home
// FilterBar and the "Đã thuộc" page so both maps read the same way. Nhóm theo
// tầng trí nhớ ("Trí nhớ") chỉ hiện khi `enableSrsTier` — xem prop.

import { CloudLang, CloudGrouping } from "../domain/wordcloud";

interface Props {
  lang: CloudLang;
  grouping: CloudGrouping;
  onLangChange: (lang: CloudLang) => void;
  onGroupingChange: (grouping: CloudGrouping) => void;
  /**
   * Cho phép nhóm theo tầng trí nhớ ("Khu vườn ký ức"). Chỉ bật ở bản đồ chính
   * (từ đang học); trang "Đã thuộc" toàn từ đã trưởng thành nên bỏ qua.
   */
  enableSrsTier?: boolean;
}

export function CloudViewControls({ lang, grouping, onLangChange, onGroupingChange, enableSrsTier }: Props) {
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
        <select value={grouping} onChange={(e) => onGroupingChange(e.target.value as CloudGrouping)}>
          <option value="none">Không</option>
          {enableSrsTier && <option value="srs">Trí nhớ</option>}
          <option value="day">Ngày</option>
          <option value="month">Tháng</option>
          <option value="year">Năm</option>
        </select>
      </label>
    </>
  );
}
