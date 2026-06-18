// Dictionary import control (SPEC 2.A): upload a Yomitan .zip into IndexedDB.

import { useEffect, useState } from "react";
import { importYomitanZip } from "../data/yomitan";
import { localTermCount } from "../data/search";

interface Props {
  onImported: () => void;
}

export function DictionaryImport({ onImported }: Props) {
  const [count, setCount] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    localTermCount().then(setCount).catch(() => undefined);
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("Đang nhập…");
    try {
      const res = await importYomitanZip(file);
      setStatus(`Đã nhập “${res.title}”: ${res.termCount} từ, ${res.reverseTokenCount} token ngược.`);
      setCount(await localTermCount());
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
        {busy ? "Đang xử lý…" : "Nhập từ điển Yomitan (.zip)"}
        <input type="file" accept=".zip" hidden disabled={busy} onChange={onFile} />
      </label>
      <span className="dict-count">{count > 0 ? `${count} từ trong IndexedDB` : "Dùng từ điển server"}</span>
      {status && <span className="dict-status">{status}</span>}
    </div>
  );
}
