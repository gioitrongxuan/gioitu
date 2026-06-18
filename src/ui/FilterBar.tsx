// Filter Bar (SPEC 3, 4.3): highlight/limit due words. Does NOT change colours.

interface Props {
  dueCount: number;
  highlightDue: boolean;
  onlyDue: boolean;
  onToggleHighlight: () => void;
  onToggleOnlyDue: () => void;
  onStartReview: () => void;
}

export function FilterBar({
  dueCount,
  highlightDue,
  onlyDue,
  onToggleHighlight,
  onToggleOnlyDue,
  onStartReview,
}: Props) {
  return (
    <div className="filter-bar">
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
