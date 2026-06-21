// Detail panel — a Yomitan-style definition view. For each matched dictionary
// entry it shows the headword with furigana, its part-of-speech tags, the chain
// of inflection reasons that led there (食べた → 食べる: quá khứ), and the
// structured-content glossary grouped by sense. Falls back to a Custom
// Definition editor when nothing is found, and surfaces the SRS stats.

import { useState } from "react";
import { TermResult } from "../data/search";
import { VocabEntry } from "@/shared/types";
import { reasonLabel } from "../domain/deinflect";
import { Definitions, Furigana, Pronunciations, TagChip } from "./StructuredContent";
import { formatInterval, formatRelative } from "@/shared/ui/format";

interface Props {
  /** The text the user searched (surface form). */
  term: string;
  /** Dictionary results (deinflected + ranked). May be empty. */
  results: TermResult[];
  /** The user's learning entry for the primary term, if any. */
  entry?: VocabEntry;
  onSaveCustom: (meaning: string) => void;
  onClose: () => void;
  /** Navigate to another term (internal `?query=` links). */
  onLookup?: (term: string) => void;
  /** Create the SRS card now ("[+]"), bypassing the ≥2-lookup gate. */
  onAddToReview?: () => void;
  /** Mark the word as already known → LEARNED. */
  onMarkKnown?: (entry: VocabEntry) => void;
  /** Mark a learned word as forgotten → relapse into the review queue. */
  onMarkForgotten?: (entry: VocabEntry) => void;
  /** Delete the word (tombstone). */
  onDelete?: (entry: VocabEntry) => void;
}

export function DetailPanel({
  term,
  results,
  entry,
  onSaveCustom,
  onClose,
  onLookup,
  onAddToReview,
  onMarkKnown,
  onMarkForgotten,
  onDelete,
}: Props) {
  const [custom, setCustom] = useState("");

  const savedLines = !results.length && entry ? safeGlosses(entry.meaning) : [];

  return (
    <aside className="detail-panel" aria-label="Chi tiết từ">
      <header>
        <h2>{term}</h2>
        <button className="link close" onClick={onClose}>✕</button>
      </header>

      {results.length > 0 ? (
        <div className="results">
          {results.map((res, i) => (
            <ResultView key={i} res={res} onLookup={onLookup} />
          ))}
        </div>
      ) : savedLines.length > 0 ? (
        <Definitions definitions={savedLines} onLookup={onLookup} />
      ) : (
        <div className="custom-def">
          <p className="muted">Không tìm thấy. Tự định nghĩa từ này:</p>
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Nhập nghĩa của bạn…"
            rows={4}
          />
          <button className="primary" disabled={!custom.trim()} onClick={() => onSaveCustom(custom.trim())}>
            Lưu định nghĩa
          </button>
        </div>
      )}

      {entry && (
        <>
          <div className="srs-stats">
            <div><span>Số lần tra</span><b>{entry.lookup_count}</b></div>
            <div><span>Trạng thái</span><b>{statusLabel(entry)}</b></div>
            <div>
              <span>Thẻ SRS</span>
              <b>{entry.card_state ?? "chưa tạo"}</b>
            </div>
            {entry.card_state && (
              <>
                <div><span>Chu kỳ</span><b>{formatInterval(entry.srs_interval)}</b></div>
                <div><span>Ôn tiếp</span><b>{formatRelative(entry.next_review)}</b></div>
                <div><span>EF / lapses</span><b>{entry.ease_factor.toFixed(2)} / {entry.lapses}</b></div>
              </>
            )}
          </div>

          {entry.card_state == null && onAddToReview && (
            <button className="primary add-review" onClick={onAddToReview}>
              Thêm vào ôn tập
            </button>
          )}

          <div className="detail-actions">
            {entry.status === "LEARNED"
              ? onMarkForgotten && (
                  <button className="link" onClick={() => onMarkForgotten(entry)}>Đã quên</button>
                )
              : onMarkKnown && (
                  <button className="link" onClick={() => onMarkKnown(entry)}>Đã nhớ</button>
                )}
            {onDelete && (
              <button
                className="link danger"
                onClick={() => {
                  if (confirm(`Xoá từ “${entry.term}”? Toàn bộ tiến độ học sẽ mất.`)) onDelete(entry);
                }}
              >
                Xoá
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function ResultView({ res, onLookup }: { res: TermResult; onLookup?: (term: string) => void }) {
  const { entry } = res;
  return (
    <section className="result">
      <div className="result-head">
        <span className="headword">
          <Furigana term={entry.term} reading={entry.reading} />
        </span>
        {entry.dictionary && <span className="dict-name">{entry.dictionary}</span>}
      </div>

      {res.reasons.length > 0 && (
        <div className="reasons" title="Cách chia của từ gốc">
          <span className="reasons-base">{entry.term}</span>
          {res.reasons.map((r, i) => (
            <span key={i} className="reason-chip">{reasonLabel(r)}</span>
          ))}
        </div>
      )}

      {entry.termTags && entry.termTags.length > 0 && (
        <div className="term-tags">
          {entry.termTags.map((t) => (
            <TagChip key={t} code={t} meta={entry.tagMeta?.[t]} kind="term" />
          ))}
        </div>
      )}

      {res.pronunciations && res.pronunciations.length > 0 && (
        <Pronunciations pronunciations={res.pronunciations} />
      )}

      <Definitions
        senses={entry.senses}
        definitions={entry.definitions}
        tagMeta={entry.tagMeta}
        onLookup={onLookup}
      />
    </section>
  );
}

function statusLabel(entry: VocabEntry): string {
  // A word with no card yet has only been seen, not committed to the queue.
  if (entry.card_state == null) return "Chưa vào ôn tập";
  const s = entry.status;
  return s === "LEARNED" ? "Đã thuộc" : s === "RELAPSED" ? "Tái quên !" : "Đang học";
}

function safeGlosses(meaning: string): string[] {
  try {
    const p = JSON.parse(meaning);
    if (Array.isArray(p)) return p.map(String);
  } catch {
    /* plain text */
  }
  return meaning ? [meaning] : [];
}
