// Edit tab: browse / prefix-search terms in a pair (paginated) and add, edit or
// delete their meanings on the shared server dictionary.

import { useCallback, useEffect, useState } from "react";
import { LangPair } from "@/shared/languages";
import { TermRow, browseTerms } from "../../data/dictAdmin";
import { NewTermForm } from "./NewTermForm";
import { TermEditor } from "./TermEditor";

const PAGE = 50;

export function EditTab({ pair, onError }: { pair: LangPair; onError: (s: string | null) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; items: TermRow[] }>({ total: 0, items: [] });
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    browseTerms(pair.source, pair.target, { q, limit: PAGE, offset: page * PAGE })
      .then(setData)
      .catch((e) => onError((e as Error).message))
      .finally(() => setLoading(false));
  }, [pair, q, page, onError]);

  // Reset to first page whenever the pair or query changes.
  useEffect(() => setPage(0), [pair, q]);
  useEffect(load, [load]);

  const pages = Math.ceil(data.total / PAGE);

  return (
    <div className="manager-body">
      <NewTermForm pair={pair} onSaved={load} onError={onError} />

      <input
        className="search-input manager-search"
        placeholder={`Tìm trong ${pair.label}…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : data.items.length === 0 ? (
        <p className="muted">Không có từ nào.</p>
      ) : (
        <ul className="term-edit-list">
          {data.items.map((t) => (
            <TermEditor key={t.term} row={t} pair={pair} onChanged={load} onError={onError} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="pager">
          <button className="link" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Trước</button>
          <span className="muted">{page + 1} / {pages} ({data.total} từ)</span>
          <button className="link" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Sau →</button>
        </div>
      )}
    </div>
  );
}
