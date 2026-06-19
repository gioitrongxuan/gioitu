// Detail panel (SPEC 4.1 Case 1): show a definition, or let the user write a
// Custom Definition when the dictionary has no result. Also surfaces SRS stats.

import { useEffect, useRef, useState } from "react";
import { DictEntry } from "../data/db";
import { VocabEntry } from "../domain/types";
import { formatInterval, formatRelative } from "./format";

interface Props {
  term: string;
  dict: DictEntry | null;
  /** The user's learning entry for this term, if any. */
  entry?: VocabEntry;
  onSaveCustom: (meaning: string) => void;
  onClose: () => void;
}

export function DetailPanel({ term, dict, entry, onSaveCustom, onClose }: Props) {
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLElement>(null);

  // When opening (or switching word) while scrolled deep into a long cloud,
  // bring the panel into view so the meaning is always visible.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [term]);

  const found = !!dict || (!!entry && !entry.is_custom) || (!!entry && entry.meaning.length > 0);
  const definitions = dict?.definitions ?? (entry ? safeGlosses(entry.meaning) : []);

  return (
    <aside className="detail-panel" aria-label="Chi tiết từ" ref={ref}>
      <header>
        <h2>{term}</h2>
        {dict?.reading && <span className="reading">{dict.reading}</span>}
        <button className="link close" onClick={onClose}>✕</button>
      </header>

      {found ? (
        <ul className="definitions">
          {definitions.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
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
