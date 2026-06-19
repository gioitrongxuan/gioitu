// Import tab: upload one or more Yomitan .zip files (or a URL) to the shared
// server dictionary, then list / delete the imported dictionaries.

import { useCallback, useEffect, useState } from "react";
import { LangPair } from "@/shared/languages";
import {
  DictionaryMeta,
  importDictionary,
  importDictionaryUrl,
  listDictionaries,
  deleteDictionary,
} from "../../data/dictAdmin";

interface Progress {
  name: string;
  status: "pending" | "done" | "error";
  detail: string;
}

export function ImportTab({ pair, onError }: { pair: LangPair; onError: (s: string | null) => void }) {
  const [dicts, setDicts] = useState<DictionaryMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [url, setUrl] = useState("");

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

  async function onImportUrl() {
    const u = url.trim();
    if (!u) return;
    onError(null);
    setBusy(true);
    setProgress([{ name: u, status: "pending", detail: "Đang tải URL…" }]);
    try {
      const opts = autoDetect ? {} : { term_lang: pair.source, native_lang: pair.target };
      const res = await importDictionaryUrl(u, opts);
      setProgress([{ name: res.title, status: "done", detail: `${res.termCount} từ · ${res.term_lang}→${res.native_lang}` }]);
      setUrl("");
    } catch (err) {
      setProgress([{ name: u, status: "error", detail: (err as Error).message }]);
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
      <div className="url-row">
        <input
          className="url-input"
          type="url"
          placeholder="…hoặc dán URL .zip Yomitan"
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onImportUrl()}
        />
        <button className="primary" disabled={busy || !url.trim()} onClick={onImportUrl}>
          Tải từ URL
        </button>
      </div>
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
