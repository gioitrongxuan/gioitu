// "Đã thuộc 🎉" cloud — the wall of mastered words, same heatmap look as the main
// cloud (shade by lookup_count) so the two read as one language. Rendered inside
// the achievement page's content area; the detail panel lives beside it (App).

import { computeShade, effectiveCount } from "../domain/wordcloud";
import { heatBackground, heatTextColor } from "@/features/theme/domain/theme";
import { useTheme } from "@/features/theme/ThemeProvider";
import { VocabEntry } from "@/shared/types";

interface Props {
  /** Mastered entries, already filtered/sorted by the store. */
  entries: VocabEntry[];
  /** Open a word's detail (read-only — does not count as a lookup). */
  onSelect: (entry: VocabEntry) => void;
}

export function LearnedCloud({ entries, onSelect }: Props) {
  const { theme } = useTheme();

  if (entries.length === 0) {
    return <p className="empty">Chưa có từ nào đã thuộc. Hãy ôn tập để chinh phục!</p>;
  }

  const counts = entries.map((e) => effectiveCount(e));
  const maxCount = counts.reduce((m, c) => Math.max(m, c), 0);

  return (
    <div className="word-cloud" role="list">
      {entries.map((entry, i) => {
        const shade = computeShade(counts[i], maxCount);
        return (
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
      })}
    </div>
  );
}
