// Detail panel — a Yomitan-style definition view. For each matched dictionary
// entry it shows the headword with furigana, its part-of-speech tags, the chain
// of inflection reasons that led there (食べた → 食べる: quá khứ), and the
// structured-content glossary grouped by sense. Falls back to a Custom
// Definition editor when nothing is found, and surfaces the SRS stats.

import { useState } from "react";
import { TermResult } from "../data/search";
import { VocabEntry } from "@/shared/types";
import { reasonLabel } from "../domain/deinflect";
import { Definitions, Furigana, TagChip } from "./StructuredContent";
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
}

export function DetailPanel({ term, results, entry, onSaveCustom, onClose, onLookup }: Props) {
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
        <div className="srs-stats">
          <div><span>Số lần tra</span><b>{entry.lookup_count}</b></div>
          <div><span>Trạng thái</span><b>{statusLabel(entry.status)}</b></div>
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

      <Definitions
        senses={entry.senses}
        definitions={entry.definitions}
        tagMeta={entry.tagMeta}
        onLookup={onLookup}
      />
    </section>
  );
}

function statusLabel(s: VocabEntry["status"]): string {
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
