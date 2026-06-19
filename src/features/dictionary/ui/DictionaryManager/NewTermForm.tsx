// Collapsible "add a new term" form for the current language pair.

import { useState } from "react";
import { LangPair } from "@/shared/languages";
import { saveTerm } from "../../data/dictAdmin";

export function NewTermForm({
  pair,
  onSaved,
  onError,
}: {
  pair: LangPair;
  onSaved: () => void;
  onError: (s: string | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [reading, setReading] = useState("");
  const [defs, setDefs] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const definitions = defs.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!term.trim() || definitions.length === 0) {
      onError("Cần nhập từ và ít nhất một nghĩa");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await saveTerm({
        term: term.trim(),
        term_lang: pair.source,
        native_lang: pair.target,
        reading: reading.trim() || undefined,
        definitions,
      });
      setTerm(""); setReading(""); setDefs("");
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="new-term">
      <summary>+ Thêm từ mới ({pair.label})</summary>
      <div className="new-term-fields">
        <input placeholder="Từ" value={term} onChange={(e) => setTerm(e.target.value)} />
        <input placeholder="Cách đọc (tùy chọn)" value={reading} onChange={(e) => setReading(e.target.value)} />
        <textarea
          placeholder="Mỗi dòng một nghĩa"
          rows={3}
          value={defs}
          onChange={(e) => setDefs(e.target.value)}
        />
        <button className="primary" disabled={busy} onClick={submit}>Lưu từ</button>
      </div>
    </details>
  );
}
