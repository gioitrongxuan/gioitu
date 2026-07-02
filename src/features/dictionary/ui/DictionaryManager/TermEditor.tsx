// Một hàng trong trình duyệt từ: hiện cách viết + cách đọc + nghĩa rút gọn. Bấm
// "Sửa" nạp toàn bộ thuộc tính sửa được (nghĩa/ POS / ví dụ / pitch…) rồi mở
// TermForm; "Xóa" gỡ từ khỏi từ điển server.

import { useState } from "react";
import { LangPair } from "@/shared/languages";
import type { TermEditState } from "@/shared/dictionary";
import { glossToText } from "@/shared/structured-content";
import { TermRow, deleteTerm, fetchTermForEdit } from "../../data/dictAdmin";
import { TermForm } from "./TermForm";

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
  const [state, setState] = useState<TermEditState | null>(null);
  const [loading, setLoading] = useState(false);

  async function openEditor() {
    setLoading(true);
    onError(null);
    try {
      setState(await fetchTermForEdit(pair.source, pair.target, row.term, row.reading));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setLoading(false);
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
          {state ? (
            <button className="link" onClick={() => setState(null)}>Đóng</button>
          ) : (
            <>
              <button className="link" disabled={loading} onClick={openEditor}>
                {loading ? "Đang tải…" : "Sửa"}
              </button>
              <button className="link danger" onClick={remove}>Xóa</button>
            </>
          )}
        </span>
      </div>
      {state ? (
        <TermForm
          pair={pair}
          mode="edit"
          initial={state}
          onError={onError}
          onCancel={() => setState(null)}
          onDone={() => {
            setState(null);
            onChanged();
          }}
        />
      ) : (
        <ul className="definitions">
          {row.definitions.map((d, i) => <li key={i}>{glossToText(d)}</li>)}
        </ul>
      )}
    </li>
  );
}
