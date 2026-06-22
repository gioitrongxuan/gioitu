// Word Cloud (SPEC 4.3): flex-wrap tags, equal height, width by word length.
// Colour = log-normalized lookup_count; badge = RELAPSED; highlight = due.

import { buildCloud, CloudSort } from "../domain/wordcloud";
import { heatBackground, heatTextColor } from "@/features/theme/domain/theme";
import { useTheme } from "@/features/theme/ThemeProvider";
import { VocabEntry } from "@/shared/types";

interface Props {
  entries: VocabEntry[];
  /** When true, due-for-review words are highlighted (filter, SPEC 4.3). */
  highlightDue: boolean;
  /** When true, show ONLY due words. */
  onlyDue: boolean;
  /** Ordering of the cloud (recent-first by default). */
  sort: CloudSort;
  /** When true, each tag shows an × that deletes it on click — no confirm. */
  deleteMode: boolean;
  onSelect: (entry: VocabEntry) => void;
  onDelete: (entry: VocabEntry) => void;
}

export function WordCloud({ entries, highlightDue, onlyDue, sort, deleteMode, onSelect, onDelete }: Props) {
  const { theme } = useTheme();
  const tags = buildCloud(entries, { now: Date.now(), sort }).filter((t) => (onlyDue ? t.due : true));

  if (tags.length === 0) {
    return <p className="empty">Chưa có từ nào trên bản đồ. Hãy tra một từ để bắt đầu.</p>;
  }

  return (
    <div className="word-cloud" role="list">
      {tags.map(({ entry, shade, hasBadge, due }) => {
        const dim = highlightDue && !due;
        const className = `tag${hasBadge ? " relapsed" : ""}${highlightDue && due ? " due" : ""}${dim ? " dimmed" : ""}${deleteMode ? " deletable" : ""}`;
        const style = { background: heatBackground(shade), color: heatTextColor(shade, theme) };

        // Delete mode: the tag itself is no longer a select button (nested
        // buttons are invalid), it's a plain container holding a delete ×.
        if (deleteMode) {
          return (
            <span
              key={`${entry.term}:${entry.term_lang}`}
              role="listitem"
              className={className}
              style={style}
              title={`Tra ${entry.lookup_count} lần`}
            >
              {hasBadge && <span className="badge" aria-label="Tái quên">!</span>}
              <span className="tag-term">{entry.term}</span>
              <button
                className="tag-delete"
                aria-label={`Xoá "${entry.term}"`}
                title="Xoá"
                onClick={() => onDelete(entry)}
              >
                ×
              </button>
            </span>
          );
        }

        return (
          <button
            key={`${entry.term}:${entry.term_lang}`}
            role="listitem"
            className={className}
            style={style}
            title={`Tra ${entry.lookup_count} lần`}
            onClick={() => onSelect(entry)}
          >
            {hasBadge && <span className="badge" aria-label="Tái quên">!</span>}
            <span className="tag-term">{entry.term}</span>
          </button>
        );
      })}
    </div>
  );
}
