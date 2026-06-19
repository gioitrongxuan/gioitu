// Dictionary import control (SPEC 2.A): upload a Yomitan .zip into IndexedDB,
// tagged with the currently selected language pair.

import { useEffect, useState } from "react";
import { importYomitanZip, localTermCount } from "../data/yomitan";
import { LangPair } from "../domain/languages";

interface Props {
  pair: LangPair;
  onImported: () => void;
}

export function DictionaryImport({ pair, onImported }: Props) {
  const [count, setCount] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    localTermCount(pair.source, pair.target).then(setCount).catch(() => undefined);
  }, [pair]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("Đang nhập…");
    try {
      // Tag the imported entries with the selected pair.
      const res = await importYomitanZip(file, { term_lang: pair.source, native_lang: pair.target });
      setStatus(`Đã nhập “${res.title}”: ${res.termCount} từ (${pair.label}).`);
      setCount(await localTermCount(pair.source, pair.target));
      onImported();
    } catch (err) {
      setStatus(`Lỗi nhập: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="dict-import">
      <label className="import-label">
        {busy ? "Đang xử lý…" : `Nhập từ điển ${pair.label} (.zip)`}
        <input type="file" accept=".zip" hidden disabled={busy} onChange={onFile} />
      </label>
      <span className="dict-count">
        {count > 0 ? `${count} từ (${pair.label})` : "Dùng từ điển server"}
      </span>
      {status && <span className="dict-status">{status}</span>}
    </div>
  );
}
