// "Đã thuộc 🎉" cloud — the wall of mastered words, same heatmap look as the main
// cloud (shade by lookup_count) so the two read as one language. Rendered inside
// the achievement page's content area; the detail panel lives beside it (App).
// Shares the main cloud's language split and time grouping.

import { computeShade, effectiveCount, filterByLang, groupByPeriod, CloudLang, TimeGrouping } from "../domain/wordcloud";
import { heatBackground, heatTextColor } from "@/features/theme/domain/theme";
import { useTheme } from "@/features/theme/ThemeProvider";
import { VocabEntry } from "@/shared/types";

interface Props {
  /** Mastered entries, already filtered/sorted by the store. */
  entries: VocabEntry[];
  /** Restrict the cloud to one language ("all" = mixed). */
  lang: CloudLang;
  /** Split the cloud into time buckets by last lookup ("none" = flat). */
  grouping: TimeGrouping;
  /** Open a word's detail (read-only — does not count as a lookup). */
  onSelect: (entry: VocabEntry) => void;
}

interface LearnedTag {
  entry: VocabEntry;
  shade: number;
}

export function LearnedCloud({ entries, lang, grouping, onSelect }: Props) {
  const { theme } = useTheme();

  if (entries.length === 0) {
    return <p className="empty">Chưa có từ nào đã thuộc. Hãy ôn tập để chinh phục!</p>;
  }

  const visible = filterByLang(entries, lang);
  if (visible.length === 0) {
    return <p className="empty">Chưa có từ đã thuộc cho ngôn ngữ này.</p>;
  }

  const counts = visible.map((e) => effectiveCount(e));
  const maxCount = counts.reduce((m, c) => Math.max(m, c), 0);
  const tags: LearnedTag[] = visible.map((entry, i) => ({ entry, shade: computeShade(counts[i], maxCount) }));

  const renderTag = ({ entry, shade }: LearnedTag) => (
    <button
      key={`${entry.term}:${entry.term_lang}`}
      role="listitem"
      className="tag"
      style={{ background: heatBackground(shade), color: heatTextColor(shade, theme) }}
      title={`Tra ${entry.lookup_count} lần`}
      onClick={() => onSelect(entry)}
    >
      <span className="tag-term">{entry.term}</span>
    </button>
  );

  if (grouping === "none") {
    return (
      <div className="word-cloud" role="list">
        {tags.map(renderTag)}
      </div>
    );
  }

  return (
    <div className="cloud-groups">
      {groupByPeriod(tags, grouping, Date.now()).map((group) => (
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
