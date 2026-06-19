// Word Cloud (SPEC 4.3): flex-wrap tags, equal height, width by word length.
// Colour = log-normalized lookup_count; badge = RELAPSED; highlight = due.

import { buildCloud, CloudSort, shadeToColor, shadeToTextColor } from "../domain/wordcloud";
import { VocabEntry } from "@/shared/types";

interface Props {
  entries: VocabEntry[];
  /** When true, due-for-review words are highlighted (filter, SPEC 4.3). */
  highlightDue: boolean;
  /** When true, show ONLY due words. */
  onlyDue: boolean;
  /** Ordering of the cloud (recent-first by default). */
  sort: CloudSort;
  onSelect: (entry: VocabEntry) => void;
}

export function WordCloud({ entries, highlightDue, onlyDue, sort, onSelect }: Props) {
  const tags = buildCloud(entries, { now: Date.now(), sort }).filter((t) => (onlyDue ? t.due : true));

  if (tags.length === 0) {
    return <p className="empty">Chưa có từ nào trên bản đồ. Hãy tra một từ để bắt đầu.</p>;
  }

  return (
    <div className="word-cloud" role="list">
      {tags.map(({ entry, shade, hasBadge, due }) => {
        const dim = highlightDue && !due;
        return (
          <button
            key={`${entry.term}:${entry.term_lang}`}
            role="listitem"
            className={`tag${hasBadge ? " relapsed" : ""}${highlightDue && due ? " due" : ""}${dim ? " dimmed" : ""}`}
            style={{ background: shadeToColor(shade), color: shadeToTextColor(shade) }}
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
