// Kanji stats page — a heatmap grid of the kanji you command, ported from the
// "Kanji Grid" Anki add-on. Colour = mastery strength (average SRS interval of
// the words that contain the kanji), shaded with the app's own heatmap palette
// so it reads like the rest of gioitu and follows the active theme. Grouping by
// JLPT / cấp lớp turns the grid into a coverage report: how much of each set you
// already know, and — optionally — which kanji are still missing.
//
// Default source is the "đã thuộc" list (SPEC: mastered words are the proof of
// what you truly know); switch to "tất cả" to include everything still in the
// SRS queue.

import { useMemo, useState } from "react";
import { VocabEntry } from "@/shared/types";
import { useTheme } from "@/features/theme/ThemeProvider";
import { heatBackground, heatTextColor } from "@/features/theme/domain/theme";
import {
  computeKanjiStats,
  knownKanji,
  applyGrouping,
  percent,
  KanjiStat,
} from "../domain/kanjigrid";
import { KANJI_GROUPINGS } from "../data/groupings";

type SourceKind = "learned" | "all";

interface Props {
  /** All non-deleted entries; the page selects the source subset itself. */
  entries: VocabEntry[];
  /** Open a kanji's Chữ Hán detail (read-only — does not count as a lookup). */
  onSelectKanji: (kanji: string) => void;
  /** Mark a kanji as already known outright ("đánh dấu nhanh" — click to master). */
  onMarkKnown: (kanji: string) => void;
}

/** SRS intervals are stored in minutes; show them as whole days. */
function daysLabel(minutes: number): string {
  return `${Math.round(minutes / 1440)} ngày`;
}

export function KanjiStats({ entries, onSelectKanji, onMarkKnown }: Props) {
  const { theme } = useTheme();
  const [source, setSource] = useState<SourceKind>("learned");
  // Index into KANJI_GROUPINGS, or -1 for the flat "Không nhóm" view.
  const [groupingIdx, setGroupingIdx] = useState(0);
  const [showMissing, setShowMissing] = useState(true);
  // "Đánh dấu nhanh": while on, a tile click marks the kanji known outright
  // instead of opening its detail — the fast way to fill in kanji you know cold.
  const [quickMark, setQuickMark] = useState(false);

  const sourceWords = useMemo(
    () =>
      source === "learned"
        ? entries.filter((e) => e.status === "LEARNED")
        : entries.filter((e) => e.card_state != null),
    [entries, source],
  );

  const stats = useMemo(() => computeKanjiStats(sourceWords), [sourceWords]);
  const grouping = groupingIdx >= 0 ? KANJI_GROUPINGS[groupingIdx] : null;

  // Derived views memoised on their real inputs so toggling "hiện kanji chưa
  // biết" or switching theme never re-walks the (large) grouping character sets.
  const flat = useMemo(() => knownKanji(stats), [stats]);
  const cov = useMemo(() => (grouping ? applyGrouping(stats, grouping) : null), [stats, grouping]);

  // Một cú bấm: chế độ nhanh thì đánh dấu đã biết, ngược lại mở chi tiết.
  const clickTile = (kanji: string) => (quickMark ? onMarkKnown(kanji) : onSelectKanji(kanji));
  const cellClass = `kanji-cell${quickMark ? " quick" : ""}`;

  const KnownTile = ({ stat }: { stat: KanjiStat }) => (
    <button
      type="button"
      className={cellClass}
      style={{ background: heatBackground(stat.score), color: heatTextColor(stat.score, theme) }}
      title={
        quickMark
          ? `Bấm để đánh dấu đã biết: ${stat.kanji}`
          : `${stat.kanji} · ${stat.wordCount} từ · ${daysLabel(stat.avgInterval)} · ${Math.round(stat.score * 100)}%`
      }
      onClick={() => clickTile(stat.kanji)}
    >
      {stat.kanji}
    </button>
  );

  // Chưa học = 0% thành thạo → đầu yếu nhất của thang màu (giống một ô đã biết
  // nhưng điểm 0). Viền đứt vẫn phân biệt "chưa có trong vốn từ" với "biết mà yếu".
  const MissingTile = ({ kanji }: { kanji: string }) => (
    <button
      type="button"
      className={`${cellClass} missing`}
      style={{ background: heatBackground(0), color: heatTextColor(0, theme) }}
      title={quickMark ? `Bấm để đánh dấu đã biết: ${kanji}` : `${kanji} · chưa học (0%)`}
      onClick={() => clickTile(kanji)}
    >
      {kanji}
    </button>
  );

  const Controls = (
    <div className="kanji-controls">
      <label className="sort-select">
        Nguồn từ
        <select value={source} onChange={(e) => setSource(e.target.value as SourceKind)}>
          <option value="learned">Đã thuộc</option>
          <option value="all">Tất cả từ đang học</option>
        </select>
      </label>
      <label className="sort-select">
        Nhóm theo
        <select value={groupingIdx} onChange={(e) => setGroupingIdx(Number(e.target.value))}>
          <option value={-1}>Không nhóm</option>
          {KANJI_GROUPINGS.map((g, i) => (
            <option key={g.name} value={i}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      {grouping && (
        <label className="kanji-check">
          <input type="checkbox" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} />
          Hiện kanji chưa biết
        </label>
      )}
      <label className="kanji-check">
        <input type="checkbox" checked={quickMark} onChange={(e) => setQuickMark(e.target.checked)} />
        Đánh dấu nhanh
      </label>
    </div>
  );

  const QuickHint = quickMark ? (
    <p className="muted kanji-quick-hint">
      Đang bật đánh dấu nhanh — bấm vào chữ để ghi nhận đã biết. Bỏ chọn để xem chi tiết.
    </p>
  ) : null;

  const Legend = (
    <div className="kanji-legend" aria-hidden>
      <span className="muted">Yếu</span>
      <span
        className="kanji-legend-bar"
        style={{ background: "linear-gradient(90deg, var(--heat-from), var(--heat-to))" }}
      />
      <span className="muted">Mạnh</span>
    </div>
  );

  // Flat view — every known kanji, strongest first. With no grouping there is no
  // "missing" set to fill in, so an empty source just shows a prompt.
  if (!cov) {
    if (stats.size === 0) {
      return (
        <div className="kanji-stats">
          {Controls}
          {QuickHint}
          <p className="empty">
            {source === "learned"
              ? "Chưa có kanji nào trong danh sách đã thuộc. Bật “Đánh dấu nhanh” rồi chọn một nhóm (JLPT…) để tự điền, hoặc học thêm từ có chữ Hán!"
              : "Chưa có kanji nào. Hãy tra và ôn thêm từ tiếng Nhật!"}
          </p>
        </div>
      );
    }
    return (
      <div className="kanji-stats">
        {Controls}
        {QuickHint}
        <p className="kanji-summary">
          Đã biết <b>{flat.length}</b> kanji
        </p>
        {Legend}
        <div className="kanji-grid">
          {flat.map((stat) => (
            <KnownTile key={stat.kanji} stat={stat} />
          ))}
        </div>
      </div>
    );
  }

  // Grouped view — coverage per group, missing kanji faded (optional). Always
  // rendered: the missing tiles show the whole set, so you can quick-mark kanji
  // you already know even before any are learnt.
  return (
    <div className="kanji-stats">
      {Controls}
      {QuickHint}
      <p className="kanji-summary">
        Đã biết <b>{cov.knownInGrouping}</b>/{cov.groupingTotal} kanji trong nhóm{" "}
        <span className="muted">({percent(cov.knownInGrouping, cov.groupingTotal)}%)</span>
      </p>
      {Legend}

      {cov.groups.map((group) => {
        const pct = percent(group.knownCount, group.total);
        return (
          <section className="kanji-group" key={group.name}>
            <div className="kanji-group-head">
              <h3>{group.name}</h3>
              <span className="kanji-group-count muted">
                {group.knownCount}/{group.total} · {pct}%
              </span>
            </div>
            <div className="kanji-progress">
              <div className="kanji-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="kanji-grid">
              {group.cells.map((cell) =>
                cell.stat ? (
                  <KnownTile key={cell.kanji} stat={cell.stat} />
                ) : showMissing ? (
                  <MissingTile key={cell.kanji} kanji={cell.kanji} />
                ) : null,
              )}
            </div>
          </section>
        );
      })}

      {cov.leftover.known.length > 0 && (
        <section className="kanji-group">
          <div className="kanji-group-head">
            <h3>{cov.leftover.name}</h3>
            <span className="kanji-group-count muted">{cov.leftover.known.length}</span>
          </div>
          <div className="kanji-grid">
            {cov.leftover.known.map((stat) => (
              <KnownTile key={stat.kanji} stat={stat} />
            ))}
          </div>
        </section>
      )}

      <p className="kanji-source-note muted">Nguồn danh sách: {cov.source}</p>
    </div>
  );
}
