// One row in the term browser: shows a term's reading + glosses, with inline
// edit / delete against the shared server dictionary.

import { useState } from "react";
import { LangPair } from "@/shared/languages";
import { glossToText } from "@/shared/structured-content";
import { TermRow, saveTerm, deleteTerm } from "../../data/dictAdmin";

export function TermEditor({
  row,
  pair,
  onChanged,
  onError,
}: {
  row: TermRow;
  pair: LangPair;
  onChanged: () => void;
  onError: (s: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [defs, setDefs] = useState(row.definitions.map(glossToText).join("\n"));
  const [reading, setReading] = useState(row.reading ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    const definitions = defs.split("\n").map((s) => s.trim()).filter(Boolean);
    if (definitions.length === 0) {
      onError("Cần ít nhất một nghĩa");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await saveTerm({
        term: row.term,
        term_lang: pair.source,
        native_lang: pair.target,
        reading: reading.trim() || undefined,
        definitions,
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Xóa từ “${row.term}”?`)) return;
    try {
      await deleteTerm(row.term, pair.source, pair.target);
      onChanged();
    } catch (err) {
      onError((err as Error).message);
    }
  }

  return (
    <li className="term-row">
      <div className="term-head">
        <b>{row.term}</b>
        {row.reading && <span className="reading">{row.reading}</span>}
        <span className="term-actions">
          {editing ? (
            <>
              <button className="link" disabled={busy} onClick={save}>Lưu</button>
              <button className="link" onClick={() => setEditing(false)}>Hủy</button>
            </>
          ) : (
            <>
              <button className="link" onClick={() => setEditing(true)}>Sửa</button>
              <button className="link danger" onClick={remove}>Xóa</button>
            </>
          )}
        </span>
      </div>
      {editing ? (
        <div className="term-edit-fields">
          <input
            placeholder="Cách đọc"
            value={reading}
            onChange={(e) => setReading(e.target.value)}
          />
          <textarea rows={3} value={defs} onChange={(e) => setDefs(e.target.value)} />
        </div>
      ) : (
        <ul className="definitions">
          {row.definitions.map((d, i) => <li key={i}>{glossToText(d)}</li>)}
        </ul>
      )}
    </li>
  );
}
