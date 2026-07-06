// Dictionary import control (SPEC 2.A) — Yomitan-style: import a `.zip` from a
// file OR a URL into IndexedDB (tagged with the selected language pair), and
// manage the list of locally installed dictionaries. Cũng là nơi chọn phạm vi
// tra cứu (cặp ngôn ngữ + nguồn Trên máy/Server) — gộp vào đây thay vì tách
// riêng trên SearchBar, để hàng tìm kiếm chỉ còn ô nhập + nút bấm.

import { useCallback, useEffect, useState } from "react";
import {
  importYomitanZip,
  importYomitanUrl,
  listLocalDictionaries,
  deleteLocalDictionary,
  localTermCount,
} from "../data/yomitan";
import { exportDictAsZip, triggerDownload } from "../data/yomitanZip";
import { ShareDialog } from "@/features/share/ui/ShareDialog";
import { LocalDictionary } from "@/shared/db";
import { LANG_PAIRS, LangPair } from "@/shared/languages";
import { DictSource, SOURCE_OPTIONS } from "../domain/source";

interface Props {
  pair: LangPair;
  onPairChange: (pair: LangPair) => void;
  source: DictSource;
  onSourceChange: (source: DictSource) => void;
  onImported: () => void;
  loggedIn: boolean;
  onRequestLogin: () => void;
  /** Đổi giá trị này để buộc đọc lại danh sách (vd sau khi đồng bộ kéo dict mới về). */
  reloadToken?: number;
}

export function DictionaryImport({ pair, onPairChange, source, onSourceChange, onImported, loggedIn, onRequestLogin, reloadToken }: Props) {
  const [count, setCount] = useState(0);
  const [dicts, setDicts] = useState<LocalDictionary[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState<LocalDictionary | null>(null);
  const sourceLabel = SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? source;

  const refresh = useCallback(() => {
    localTermCount(pair.source, pair.target).then(setCount).catch(() => undefined);
    listLocalDictionaries().then(setDicts).catch(() => undefined);
  }, [pair]);

  // Đọc lại khi đổi cặp ngôn ngữ (refresh) hoặc khi reloadToken đổi (sau sync).
  useEffect(refresh, [refresh, reloadToken]);

  async function run(
    label: string,
    task: () => Promise<{ title: string; termCount: number; metaCount: number }>,
  ) {
    setBusy(true);
    setStatus(label);
    try {
      const res = await task();
      setStatus(`Đã nhập “${res.title}”: ${importSummary(res)} (${pair.label}).`);
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
    if (!confirm(`Xóa từ điển “${d.title}” (${importSummary(d)}) khỏi máy này?`)) return;
    await deleteLocalDictionary(d.id);
    refresh();
    onImported();
  }

  async function onExport(d: LocalDictionary) {
    try {
      const { blob, filename } = await exportDictAsZip(d.id);
      triggerDownload(blob, filename);
    } catch (err) {
      setStatus(`Lỗi xuất: ${(err as Error).message}`);
    }
  }

  return (
    <div className="dict-import">
      <button
        type="button"
        className="pair-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {pair.label}
        <span className="scope-source">{sourceLabel}</span>
        <span className="caret" aria-hidden>▾</span>
      </button>

      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="dict-import-panel">
            <p className="menu-group-label">Từ điển</p>
            <ul className="scope-list" role="listbox" aria-label="Chọn từ điển">
              {LANG_PAIRS.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={p.id === pair.id}
                    className={p.id === pair.id ? "active" : ""}
                    onClick={() => onPairChange(p)}
                  >
                    {p.label}
                  </button>
                </li>
              ))}
            </ul>
            <p className="menu-group-label">Nguồn</p>
            <ul className="scope-list" role="listbox" aria-label="Nguồn từ điển">
              {SOURCE_OPTIONS.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === source}
                    className={o.value === source ? "active" : ""}
                    title={o.value === "local" ? "Từ điển đã nhập trên máy (IndexedDB)" : "Từ điển trên máy chủ (Cloud)"}
                    onClick={() => onSourceChange(o.value)}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>

            <p className="menu-group-label">Quản lý ({count > 0 ? `${count} từ trên máy` : "chưa có từ điển trên máy"})</p>
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
                    <span className="ld-meta">{d.term_lang}→{d.native_lang} · {importSummary(d)}</span>
                    <button className="link" onClick={() => onExport(d)} title="Tải file .zip Yomitan để lưu / chuyển máy">Tải ZIP</button>
                    <button className="link" onClick={() => { setSharing(d); setOpen(false); }} title="Tạo link chia sẻ tạm (5 phút)">Chia sẻ</button>
                    <button className="link danger" onClick={() => onDelete(d)}>Xóa</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {sharing && (
        <ShareDialog
          loggedIn={loggedIn}
          dict={{ id: sharing.id, title: sharing.title }}
          onRequestLogin={() => {
            setSharing(null);
            onRequestLogin();
          }}
          onClose={() => setSharing(null)}
        />
      )}

    </div>
  );
}

/** Human label for what an import added: headwords, meta rows, or both. */
function importSummary({ termCount, metaCount }: { termCount: number; metaCount?: number }): string {
  const parts: string[] = [];
  if (termCount > 0) parts.push(`${termCount} từ`);
  // Meta rows là phát âm (IPA) hoặc tần suất — gọi chung là "chú thích".
  if (metaCount) parts.push(`${metaCount} chú thích`);
  return parts.length ? parts.join(" · ") : "0 từ";
}
