// Word Cloud (SPEC 4.3): flex-wrap tags, equal height, width by word length.
// Colour = log-normalized lookup_count; badge = RELAPSED; highlight = due.
// Can be split by language and grouped into time buckets (ngày/tháng/năm).

import { buildCloud, groupByPeriod, CloudSort, CloudLang, TimeGrouping, CloudTag } from "../domain/wordcloud";
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
  /** Restrict the cloud to one language ("all" = mixed). */
  lang: CloudLang;
  /** Split the cloud into time buckets by last lookup ("none" = flat). */
  grouping: TimeGrouping;
  /** When true, each tag shows an × that deletes it on click — no confirm. */
  deleteMode: boolean;
  onSelect: (entry: VocabEntry) => void;
  onDelete: (entry: VocabEntry) => void;
}

export function WordCloud({ entries, highlightDue, onlyDue, sort, lang, grouping, deleteMode, onSelect, onDelete }: Props) {
  const { theme } = useTheme();
  const now = Date.now();
  const tags = buildCloud(entries, { now, sort, lang }).filter((t) => (onlyDue ? t.due : true));

  if (tags.length === 0) {
    return <p className="empty">Chưa có từ nào trên bản đồ. Hãy tra một từ để bắt đầu.</p>;
  }

  const renderTag = ({ entry, shade, hasBadge, due }: CloudTag) => {
    const dim = highlightDue && !due;
    const className = `tag${hasBadge ? " relapsed" : ""}${highlightDue && due ? " due" : ""}${dim ? " dimmed" : ""}${deleteMode ? " deletable" : ""}`;
    const style = { background: heatBackground(shade), color: heatTextColor(shade, theme) };
    const key = `${entry.term}:${entry.term_lang}`;

    // Delete mode: the tag itself is no longer a select button (nested buttons
    // are invalid), it's a plain container holding a delete ×.
    if (deleteMode) {
      return (
        <span key={key} role="listitem" className={className} style={style} title={`Tra ${entry.lookup_count} lần`}>
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
        key={key}
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
  };

  if (grouping === "none") {
    return (
      <div className="word-cloud" role="list">
        {tags.map(renderTag)}
      </div>
    );
  }

  return (
    <div className="cloud-groups">
      {groupByPeriod(tags, grouping, now).map((group) => (
        <section className="cloud-group" key={group.key}>
          <h3 className="cloud-group-head">{group.label}</h3>
          <div className="word-cloud" role="list">
            {group.items.map(renderTag)}
          </div>
        </section>
      ))}
    </div>
  );
}
