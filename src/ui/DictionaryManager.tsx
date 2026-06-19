// Dictionary management screen (server-backed). Import Yomitan .zip files,
// list/delete imported dictionaries, and browse/edit term meanings.
// Mutates the shared server dictionary, so it requires a signed-in user.

import { useCallback, useEffect, useState } from "react";
import { LANG_PAIRS, LangPair, DEFAULT_PAIR } from "../domain/languages";
import {
  DictionaryMeta,
  TermRow,
  importDictionary,
  listDictionaries,
  deleteDictionary,
  browseTerms,
  saveTerm,
  deleteTerm,
} from "../data/dictAdmin";

interface Props {
  /** Set when signed in; management requires it. */
  loggedIn: boolean;
  onRequestLogin: () => void;
  onClose: () => void;
}

type Tab = "import" | "edit";
const PAGE = 50;

export function DictionaryManager({ loggedIn, onRequestLogin, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("import");
  const [pair, setPair] = useState<LangPair>(DEFAULT_PAIR);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manager-card" role="dialog" aria-label="Quản lý từ điển">
        <header className="manager-head">
          <h2>Quản lý từ điển</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}>×</button>
        </header>

        {!loggedIn ? (
          <div className="manager-gate">
            <p className="muted">Bạn cần đăng nhập để nhập và chỉnh sửa từ điển trên máy chủ.</p>
            <button className="primary" onClick={onRequestLogin}>Đăng nhập</button>
          </div>
        ) : (
          <>
            <div className="manager-tabs">
              <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>
                Nhập & danh sách
              </button>
              <button className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>
                Tra cứu & sửa nghĩa
              </button>
            </div>

            <PairSelect pair={pair} onChange={setPair} />
            {error && <p className="auth-error">{error}</p>}

            {tab === "import" ? (
              <ImportTab pair={pair} onError={setError} />
            ) : (
              <EditTab pair={pair} onError={setError} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PairSelect({ pair, onChange }: { pair: LangPair; onChange: (p: LangPair) => void }) {
  return (
    <div className="pair-toggle manager-pair">
      {LANG_PAIRS.map((p) => (
        <button
          key={p.id}
          className={p.id === pair.id ? "active" : ""}
          onClick={() => onChange(p)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Import tab: upload zips + list/delete dictionaries ----------

interface Progress {
  name: string;
  status: "pending" | "done" | "error";
  detail: string;
}

function ImportTab({ pair, onError }: { pair: LangPair; onError: (s: string | null) => void }) {
  const [dicts, setDicts] = useState<DictionaryMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [progress, setProgress] = useState<Progress[]>([]);

  const refresh = useCallback(() => {
    listDictionaries().then(setDicts).catch((e) => onError((e as Error).message));
  }, [onError]);

  useEffect(refresh, [refresh]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    onError(null);
    setBusy(true);
    setProgress(files.map((f) => ({ name: f.name, status: "pending", detail: "Đang nhập…" })));

    for (let i = 0; i < files.length; i++) {
      try {
        const opts = autoDetect ? {} : { term_lang: pair.source, native_lang: pair.target };
        const res = await importDictionary(files[i], opts);
        setProgress((p) =>
          p.map((row, j) =>
            j === i
              ? { ...row, status: "done", detail: `${res.termCount} từ · ${res.term_lang}→${res.native_lang}` }
              : row,
          ),
        );
      } catch (err) {
        setProgress((p) =>
          p.map((row, j) => (j === i ? { ...row, status: "error", detail: (err as Error).message } : row)),
        );
      }
    }
    setBusy(false);
    refresh();
  }

  async function onDelete(d: DictionaryMeta) {
    if (!confirm(`Xóa từ điển “${d.title}” (${d.term_count} từ)?`)) return;
    try {
      await deleteDictionary(d.id);
      refresh();
    } catch (err) {
      onError((err as Error).message);
    }
  }

  return (
    <div className="manager-body">
      <label className="import-label block">
        {busy ? "Đang xử lý…" : "Chọn file .zip Yomitan (có thể chọn nhiều)"}
        <input type="file" accept=".zip" multiple hidden disabled={busy} onChange={onFiles} />
      </label>
      <label className="chk">
        <input type="checkbox" checked={autoDetect} onChange={(e) => setAutoDetect(e.target.checked)} />
        Tự nhận ngôn ngữ từ file (index.json). Bỏ chọn để gán theo cặp “{pair.label}”.
      </label>

      {progress.length > 0 && (
        <ul className="import-progress">
          {progress.map((p, i) => (
            <li key={i} className={p.status}>
              <span className="ip-name">{p.name}</span>
              <span className="ip-detail">{p.detail}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="manager-subhead">Từ điển đã nhập</h3>
      {dicts.length === 0 ? (
        <p className="muted">Chưa có từ điển nào trên máy chủ.</p>
      ) : (
        <table className="dict-table">
          <thead>
            <tr><th>Tên</th><th>Cặp</th><th>Số từ</th><th></th></tr>
          </thead>
          <tbody>
            {dicts.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>{d.term_lang}→{d.native_lang}</td>
                <td>{d.term_count}</td>
                <td><button className="link danger" onClick={() => onDelete(d)}>Xóa</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- Edit tab: browse/search terms + add/edit/delete meanings ----------

function EditTab({ pair, onError }: { pair: LangPair; onError: (s: string | null) => void }) {
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

function NewTermForm({
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

function TermEditor({
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
  const [defs, setDefs] = useState(row.definitions.join("\n"));
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
          {row.definitions.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      )}
    </li>
  );
}
