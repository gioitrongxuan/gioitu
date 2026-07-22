// Filter Bar (SPEC 3, 4.3): highlight/limit due words and choose cloud order.
// Highlighting/sorting does NOT change tag colours (colour stays by lookup_count).
// Desktop trải phẳng thành một hàng; màn hẹp gom mọi control vào popover sau
// nút "Bộ lọc" (CSS quyết định — cùng một markup) để chỉ còn [Bộ lọc][Ôn tập].

import { useState } from "react";
import { CloudSort, CloudLang, CloudGrouping } from "../domain/wordcloud";
import { CloudViewControls } from "./CloudViewControls";
import { ChevronDownIcon } from "@/shared/ui/icons";

interface Props {
  dueCount: number;
  highlightDue: boolean;
  onlyDue: boolean;
  deleteMode: boolean;
  sort: CloudSort;
  lang: CloudLang;
  grouping: CloudGrouping;
  onToggleHighlight: () => void;
  onToggleOnlyDue: () => void;
  onToggleDeleteMode: () => void;
  onSortChange: (sort: CloudSort) => void;
  onLangChange: (lang: CloudLang) => void;
  onGroupingChange: (grouping: CloudGrouping) => void;
  onStartReview: () => void;
}

export function FilterBar({
  dueCount,
  highlightDue,
  onlyDue,
  deleteMode,
  sort,
  lang,
  grouping,
  onToggleHighlight,
  onToggleOnlyDue,
  onToggleDeleteMode,
  onSortChange,
  onLangChange,
  onGroupingChange,
  onStartReview,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="filter-bar">
      <button
        type="button"
        className="chip-toggle filter-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Bộ lọc <span className="caret" aria-hidden><ChevronDownIcon /></span>
      </button>
      {open && <div className="menu-backdrop" onClick={() => setOpen(false)} />}
      <div className={`filter-controls${open ? " open" : ""}`}>
        <CloudViewControls
          lang={lang}
          grouping={grouping}
          onLangChange={onLangChange}
          onGroupingChange={onGroupingChange}
          enableSrsTier
        />
        <label className="sort-select">
          Sắp xếp
          <select value={sort} onChange={(e) => onSortChange(e.target.value as CloudSort)}>
            <option value="recent">Mới tra nhất</option>
            <option value="frequency">Tần suất tra</option>
          </select>
        </label>
        {/* Chip bật/tắt thay checkbox — cùng ngôn ngữ pill với phần còn lại. */}
        <button type="button" className={`chip-toggle${highlightDue ? " on" : ""}`} aria-pressed={highlightDue} onClick={onToggleHighlight}>
          Nổi bật từ cần ôn
        </button>
        <button type="button" className={`chip-toggle${onlyDue ? " on" : ""}`} aria-pressed={onlyDue} onClick={onToggleOnlyDue}>
          Chỉ hiện từ cần ôn
        </button>
        <button type="button" className={`chip-toggle danger${deleteMode ? " on" : ""}`} aria-pressed={deleteMode} onClick={onToggleDeleteMode}>
          Chế độ xoá
        </button>
      </div>
      <button className="review-btn" disabled={dueCount === 0} onClick={onStartReview}>
        Ôn tập hôm nay ({dueCount})
      </button>
    </div>
  );
}
