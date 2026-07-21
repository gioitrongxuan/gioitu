// Trang học từ vựng — lưới ô từ kiểu kanji grid, overlay tiến độ SRS để đánh dấu
// nhanh biết/không biết. Người dùng chọn 1 trong 3 nguồn danh sách từ:
//   • Study list      — bộ sưu tập từ (server, cần đăng nhập)
//   • Từ điển cá nhân — các dict tự soạn (local IndexedDB)
//   • Lịch sử         — các từ đã tra cứu (store.entries)
// Tương tác mỗi ô (giống KanjiStats): một cú bấm, hành vi tuỳ chế độ —
//   • Thường          → hiện nghĩa (read-only, KHÔNG đếm lượt tra)
//   • "Đánh dấu nhanh" → toggle nhớ ↔ không nhớ (LEARNED ↔ relapse về hàng ôn),
//     kèm toast "Hoàn tác" để lỡ tay còn gỡ được.
// Bỏ click-đúp cũ: trên cảm ứng không ổn định và click đơn phải trễ 250ms.

import { useEffect, useMemo, useState } from "react";
import { VocabEntry } from "@/shared/types";
import { Skeleton } from "@/shared/ui/Skeleton";
import { useTheme } from "@/features/theme/ThemeProvider";
import { heatBackground, heatTextColor } from "@/features/theme/domain/theme";
import { LangPair, LANG_PAIRS } from "@/shared/languages";
import { authToken } from "@/features/auth/data/auth";
import {
  applyProgress,
  cellShade,
  countProgress,
  percent,
  VocabCell,
  VocabListWord,
  VocabProgress,
} from "../domain/vocablist";
import * as studyListSrc from "../data/studyListSource";
import * as customDictSrc from "../data/customDictSource";

type SourceKind = "studylist" | "custom" | "history";
type StatusFilter = "all" | VocabProgress;

type Selection =
  | { kind: "studylist"; list: studyListSrc.StudyListSummary }
  | { kind: "custom"; dict: customDictSrc.LocalDictionary }
  | { kind: "history" };

const SOURCE_LABEL: Record<SourceKind, string> = {
  studylist: "Study list",
  custom: "Từ điển cá nhân",
  history: "Lịch sử",
};

const STATUS_LABEL: Record<VocabProgress, string> = {
  missing: "Chưa học",
  learning: "Đang học",
  due: "Cần ôn",
  learned: "Đã thuộc",
};

interface Props {
  entries: VocabEntry[];
  pair: LangPair;
  onPairChange: (p: LangPair) => void;
  /** Click 1 — mở chi tiết (read-only, không đếm lượt tra). */
  onSelect: (w: VocabListWord) => void;
  /** Click đúp — toggle nhớ/không nhớ. entry là trạng thái SRS hiện tại. */
  onToggle: (w: VocabListWord, entry: VocabEntry | undefined) => void;
  /** Mở màn đăng nhập (khi khách chọn nguồn study list). */
  onRequestLogin: () => void;
}

export function VocabStudy({ entries, pair, onPairChange, onSelect, onToggle, onRequestLogin }: Props) {
  const { theme } = useTheme();
  const [source, setSource] = useState<SourceKind>("history");
  const [selection, setSelection] = useState<Selection>({ kind: "history" });
  const [words, setWords] = useState<VocabListWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  // "Đánh dấu nhanh": bật thì một cú bấm sẽ toggle nhớ/không nhớ thay vì xem nghĩa
  // (giống KanjiStats). Tắt là mặc định an toàn — bấm chỉ để xem.
  const [quickMark, setQuickMark] = useState(false);

  // Khi đổi nguồn hoặc lựa chọn — tải danh sách từ tương ứng.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setWords([]);
    const done = (w: VocabListWord[]) => {
      if (alive) setWords(w);
    };
    const fail = (e: unknown) => {
      if (alive) setError((e as Error).message || "Không tải được danh sách");
    };
    const finish = () => alive && setLoading(false);

    if (selection.kind === "history") {
      // Lịch sử: dùng luôn entries của người dùng (lọc theo cặp đang chọn).
      done(
        entries
          .filter((e) => e.term_lang === pair.source && e.native_lang === pair.target)
          .map((e) => ({ term: e.term, reading: e.reading, term_lang: e.term_lang, native_lang: e.native_lang })),
      );
      finish();
    } else if (selection.kind === "custom") {
      customDictSrc.loadCustomDict(selection.dict.id).then((r) => done(r.words)).catch(fail).finally(finish);
    } else {
      studyListSrc.loadStudyList(selection.list.id).then((r) => done(r.words)).catch(fail).finally(finish);
    }
    return () => {
      alive = false;
    };
  }, [selection, entries, pair]);

  const cells = useMemo<VocabCell[]>(
    () => applyProgress(words, entries, Date.now()),
    [words, entries],
  );
  const counts = useMemo(() => countProgress(cells), [cells]);
  const visible = useMemo(
    () => (filter === "all" ? cells : cells.filter((c) => c.progress === filter)),
    [cells, filter],
  );
  const learnedPct = percent(counts.learned, counts.total);

  // Chuyển nguồn — reset lựa chọn về mặc định (history không cần chọn thêm).
  const pickSource = (k: SourceKind) => {
    setSource(k);
    setFilter("all");
    if (k === "history") setSelection({ kind: "history" });
  };

  return (
    <div className="vocab-study">
      <SourceBar source={source} onSourceChange={pickSource} />

      {/* Mỗi nguồn có pha lựa chọn riêng (study list/custom) hoặc dùng luôn (history). */}
      {source === "studylist" && !selectionIs(selection, "studylist") && (
        <StudyListPicker
          onPick={(list) => setSelection({ kind: "studylist", list })}
          onRequestLogin={onRequestLogin}
          loading={loading}
          error={error}
        />
      )}
      {source === "custom" && !selectionIs(selection, "custom") && (
        <CustomDictPicker
          pair={pair}
          onPick={(dict) => setSelection({ kind: "custom", dict })}
          loading={loading}
          error={error}
        />
      )}

      {/* Khi đã có danh sách từ (lựa chọn xong) — hiện tiêu đề + lưới. */}
      {(selectionIs(selection, "studylist") || selectionIs(selection, "custom") || selection.kind === "history") && (
        <>
          <div className="vocab-head">
            <h2>{selectionTitle(selection)}</h2>
            {(selectionIs(selection, "studylist") || selectionIs(selection, "custom")) && (
              <button className="link" onClick={() => setSelection({ kind: selection.kind } as Selection)}>
                ← Đổi
              </button>
            )}
            {selection.kind === "history" && <PairPicker pair={pair} onPairChange={onPairChange} />}
            <span className="muted">({counts.total} từ)</span>
          </div>

          {counts.total > 0 && (
            <>
              <p className="kanji-summary">
                Đã thuộc <b>{counts.learned}</b>/{counts.total}{" "}
                <span className="muted">({learnedPct}%)</span> · đang học {counts.learning} · cần ôn{" "}
                {counts.due} · chưa học {counts.missing}
              </p>
              <div className="kanji-progress" title={`Đã thuộc ${learnedPct}%`}>
                <div className="kanji-progress-fill" style={{ width: `${learnedPct}%` }} />
              </div>

              <div className="kanji-controls">
                <label className="sort-select">
                  Lọc theo
                  <select value={filter} onChange={(e) => setFilter(e.target.value as StatusFilter)}>
                    <option value="all">Tất cả</option>
                    <option value="missing">Chưa học</option>
                    <option value="learning">Đang học</option>
                    <option value="due">Cần ôn</option>
                    <option value="learned">Đã thuộc</option>
                  </select>
                </label>
                <label className="kanji-check">
                  <input
                    type="checkbox"
                    checked={quickMark}
                    onChange={(e) => setQuickMark(e.target.checked)}
                  />
                  Đánh dấu nhanh
                </label>
                <span className="vocab-mode-hint muted">
                  {quickMark ? "Bấm để đánh dấu nhớ ↔ không nhớ" : "Bấm để xem nghĩa"}
                </span>
              </div>
            </>
          )}

          {loading && <Skeleton lines={2} />}
          {error && <p className="muted">{error}</p>}

          {!loading && counts.total === 0 ? (
            <p className="empty">
              {selection.kind === "history"
                ? "Chưa có từ nào đã tra cho cặp này."
                : "Danh sách này chưa có từ nào."}
            </p>
          ) : visible.length === 0 ? (
            <p className="empty">Không có từ nào khớp bộ lọc.</p>
          ) : (
            <div className="vocab-grid" role="list">
              {visible.map((cell) => (
                <VocabTile
                  key={`${cell.word.term}:${cell.word.term_lang}:${cell.word.reading ?? ""}`}
                  cell={cell}
                  theme={theme}
                  quickMark={quickMark}
                  onView={() => onSelect(cell.word)}
                  onToggle={() => onToggle(cell.word, cell.entry)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Guard kiểu: selection có đang là nguồn `kind` không. */
function selectionIs<S extends SourceKind>(s: Selection, kind: S): s is Extract<Selection, { kind: S }> {
  return s.kind === kind;
}

/** Tiêu đề hiển thị theo lựa chọn. */
function selectionTitle(s: Selection): string {
  if (s.kind === "studylist") return s.list.name;
  if (s.kind === "custom") return s.dict.title;
  return "Lịch sử tra cứu";
}

function SourceBar({ source, onSourceChange }: { source: SourceKind; onSourceChange: (k: SourceKind) => void }) {
  return (
    <label className="sort-select vocab-pair">
      Nguồn danh sách
      <select value={source} onChange={(e) => onSourceChange(e.target.value as SourceKind)}>
        {(Object.keys(SOURCE_LABEL) as SourceKind[]).map((k) => (
          <option key={k} value={k}>
            {SOURCE_LABEL[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

function PairPicker({ pair, onPairChange }: { pair: LangPair; onPairChange: (p: LangPair) => void }) {
  return (
    <label className="sort-select">
      Cặp ngôn ngữ
      <LangPairSelect pair={pair} onPairChange={onPairChange} />
    </label>
  );
}

function LangPairSelect({ pair, onPairChange }: { pair: LangPair; onPairChange: (p: LangPair) => void }) {
  return (
    <select value={pair.id} onChange={(e) => onPairChange(LANG_PAIRS.find((p) => p.id === e.target.value) ?? pair)}>
      {LANG_PAIRS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

function StudyListPicker({
  onPick,
  onRequestLogin,
  loading,
  error,
}: {
  onPick: (l: studyListSrc.StudyListSummary) => void;
  onRequestLogin: () => void;
  loading: boolean;
  error: string;
}) {
  const [lists, setLists] = useState<studyListSrc.StudyListSummary[] | null>(null);
  useEffect(() => {
    if (!authToken()) return;
    let alive = true;
    studyListSrc.listMine().then((ls) => alive && setLists(ls)).catch(() => alive && setLists([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!authToken()) {
    return (
      <p className="empty">
        Study list lưu theo tài khoản.{" "}
        <button className="link" onClick={onRequestLogin}>
          Đăng nhập
        </button>{" "}
        để dùng nguồn này, hoặc chọn nguồn khác.
      </p>
    );
  }
  if (loading && lists === null) return <Skeleton lines={2} />;
  if (error && lists === null) return <p className="muted">{error}</p>;
  if (lists && lists.length === 0) {
    return (
      <p className="empty">
        Chưa có danh sách nào. Mở một từ trên trang tra cứu, bấm “＋ Danh sách” để thêm vào danh sách mới.
      </p>
    );
  }
  return (
    <ul className="vocab-list-pick">
      {lists?.map((l) => (
        <li key={l.id}>
          <button className="link vocab-list-item" onClick={() => onPick(l)}>
            <span className="vocab-list-name">{l.name}</span>
            <span className="muted"> ({l.wordCount} từ)</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CustomDictPicker({
  pair,
  onPick,
  loading,
  error,
}: {
  pair: LangPair;
  onPick: (d: customDictSrc.LocalDictionary) => void;
  loading: boolean;
  error: string;
}) {
  const [dicts, setDicts] = useState<customDictSrc.LocalDictionary[] | null>(null);
  useEffect(() => {
    let alive = true;
    customDictSrc.listCustomDictionaries(pair).then((ds) => alive && setDicts(ds)).catch(() => alive && setDicts([]));
    return () => {
      alive = false;
    };
  }, [pair]);

  if (loading && dicts === null) return <Skeleton lines={2} />;
  if (error && dicts === null) return <p className="muted">{error}</p>;
  if (dicts && dicts.length === 0) {
    return (
      <p className="empty">
        Chưa có từ điển cá nhân nào cho cặp {pair.label}. Tạo/soạn từ trang “Từ điển cá nhân” rồi quay lại.
      </p>
    );
  }
  return (
    <ul className="vocab-list-pick">
      {dicts?.map((d) => (
        <li key={d.id}>
          <button className="link vocab-list-item" onClick={() => onPick(d)}>
            <span className="vocab-list-name">{d.title}</span>
            <span className="muted"> ({d.termCount} từ)</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Một ô từ: shade heatmap theo trạng thái học; viền đứt cho từ chưa có trong vốn
 * từ. Một cú bấm — chế độ thường mở nghĩa, "Đánh dấu nhanh" thì toggle nhớ/không
 * nhớ. Không còn click-đúp (chậm + kém tin cậy trên cảm ứng).
 */
function VocabTile({
  cell,
  theme,
  quickMark,
  onView,
  onToggle,
}: {
  cell: VocabCell;
  theme: ReturnType<typeof useTheme>["theme"];
  quickMark: boolean;
  onView: () => void;
  onToggle: () => void;
}) {
  const shade = cellShade(cell.progress);
  const missing = cell.progress === "missing";
  const known = cell.progress === "learned";

  const action = quickMark ? `đánh dấu ${known ? "không nhớ" : "đã nhớ"}` : "xem nghĩa";

  return (
    <button
      type="button"
      role="listitem"
      className={`vocab-cell${missing ? " missing" : ""}${known ? " known" : ""}${quickMark ? " quick" : ""}`}
      style={{ background: heatBackground(shade), color: heatTextColor(shade, theme) }}
      title={`${cell.word.term}${cell.word.reading ? ` 【${cell.word.reading}】` : ""} · ${STATUS_LABEL[cell.progress]}\nBấm để ${action}`}
      onClick={quickMark ? onToggle : onView}
    >
      <span className="vocab-term">{cell.word.term}</span>
      {cell.word.reading && <span className="vocab-reading">{cell.word.reading}</span>}
      {known && <span className="vocab-known-mark" aria-hidden>✓</span>}
    </button>
  );
}
