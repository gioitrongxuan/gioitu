// Dictionary import control (SPEC 2.A) — Yomitan-style: import a `.zip` from a
// file OR a URL into IndexedDB (tagged with the selected language pair), and
// manage the list of locally installed dictionaries.

import { useCallback, useEffect, useState } from "react";
import {
  importYomitanZip,
  importYomitanUrl,
  listLocalDictionaries,
  deleteLocalDictionary,
  localTermCount,
} from "../data/yomitan";
import { LocalDictionary } from "../data/db";
import { LangPair } from "../domain/languages";

interface Props {
  pair: LangPair;
  onImported: () => void;
}

export function DictionaryImport({ pair, onImported }: Props) {
  const [count, setCount] = useState(0);
  const [dicts, setDicts] = useState<LocalDictionary[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    localTermCount(pair.source, pair.target).then(setCount).catch(() => undefined);
    listLocalDictionaries().then(setDicts).catch(() => undefined);
  }, [pair]);

  useEffect(refresh, [refresh]);

  async function run(label: string, task: () => Promise<{ title: string; termCount: number }>) {
    setBusy(true);
    setStatus(label);
    try {
      const res = await task();
      setStatus(`Đã nhập “${res.title}”: ${res.termCount} từ (${pair.label}).`);
      refresh();
      onImported();
    } catch (err) {
      setStatus(`Lỗi nhập: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await run("Đang nhập file…", () =>
      importYomitanZip(file, { term_lang: pair.source, native_lang: pair.target }),
    );
  }

  async function onUrl() {
    const u = url.trim();
    if (!u) return;
    await run("Đang tải URL…", async () => {
      const res = await importYomitanUrl(u, { term_lang: pair.source, native_lang: pair.target });
      setUrl("");
      return res;
    });
  }

  async function onDelete(d: LocalDictionary) {
    if (!confirm(`Xóa từ điển “${d.title}” (${d.termCount} từ) khỏi máy này?`)) return;
    await deleteLocalDictionary(d.id);
    refresh();
    onImported();
  }

  return (
    <div className="dict-import">
      <button className="link" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Từ điển ({count > 0 ? `${count} từ` : "server"})
      </button>

      {open && (
        <div className="dict-import-panel">
          <label className="import-label">
            {busy ? "Đang xử lý…" : `Nhập file .zip (${pair.label})`}
            <input type="file" accept=".zip" hidden disabled={busy} onChange={onFile} />
          </label>

          <div className="url-row">
            <input
              className="url-input"
              type="url"
              placeholder="…hoặc dán URL .zip Yomitan"
              value={url}
              disabled={busy}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onUrl()}
            />
            <button className="primary" disabled={busy || !url.trim()} onClick={onUrl}>
              Tải
            </button>
          </div>

          {status && <p className="dict-status">{status}</p>}

          {dicts.length > 0 && (
            <ul className="local-dict-list">
              {dicts.map((d) => (
                <li key={d.id}>
                  <span className="ld-title">{d.title}</span>
                  <span className="ld-meta">{d.term_lang}→{d.native_lang} · {d.termCount}</span>
                  <button className="link danger" onClick={() => onDelete(d)}>Xóa</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
