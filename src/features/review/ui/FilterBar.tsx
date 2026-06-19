// Filter Bar (SPEC 3, 4.3): highlight/limit due words and choose cloud order.
// Highlighting/sorting does NOT change tag colours (colour stays by lookup_count).

import { CloudSort } from "../domain/wordcloud";

interface Props {
  dueCount: number;
  highlightDue: boolean;
  onlyDue: boolean;
  sort: CloudSort;
  onToggleHighlight: () => void;
  onToggleOnlyDue: () => void;
  onSortChange: (sort: CloudSort) => void;
  onStartReview: () => void;
}

export function FilterBar({
  dueCount,
  highlightDue,
  onlyDue,
  sort,
  onToggleHighlight,
  onToggleOnlyDue,
  onSortChange,
  onStartReview,
}: Props) {
  return (
    <div className="filter-bar">
      <label className="sort-select">
        Sắp xếp
        <select value={sort} onChange={(e) => onSortChange(e.target.value as CloudSort)}>
          <option value="recent">Mới tra nhất</option>
          <option value="frequency">Tần suất tra</option>
        </select>
      </label>
      <label className="chk">
        <input type="checkbox" checked={highlightDue} onChange={onToggleHighlight} />
        Nổi bật từ cần ôn
      </label>
      <label className="chk">
        <input type="checkbox" checked={onlyDue} onChange={onToggleOnlyDue} />
        Chỉ hiện từ cần ôn
      </label>
      <button className="review-btn" disabled={dueCount === 0} onClick={onStartReview}>
        Ôn tập hôm nay ({dueCount})
      </button>
    </div>
  );
}
