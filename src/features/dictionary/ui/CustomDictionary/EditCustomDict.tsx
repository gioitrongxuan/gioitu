// Xem & sửa một từ điển cá nhân đã có: nạp toàn bộ từ của nó vào lưới (tái dùng
// ManualGrid), cho sửa/xoá/thêm từng từ và đổi metadata, rồi lưu "khớp đúng" (từ
// bị xoá khỏi lưới sẽ bị xoá thật). I/O ở data/customDict; đảo entry↔draft ở domain.

import { useEffect, useState } from "react";
import { LocalDictionary } from "@/shared/db";
import { pairById, pairId } from "@/shared/languages";
import { listCustomEntries, saveCustomDict } from "../../data/customDict";
import { CustomDraft, dictEntryToDraft, emptyDraft, isDraftFilled } from "../../domain/customEntry";
import { ManualGrid } from "./ManualGrid";

interface Props {
  dict: LocalDictionary;
  onClose: () => void;
  /** Gọi sau khi lưu để app làm mới (đếm từ, đồng bộ…). */
  onSaved?: () => void;
}

export function EditCustomDict({ dict, onClose, onSaved }: Props) {
  const pair = pairById(pairId(dict.term_lang, dict.native_lang));
  const [title, setTitle] = useState(dict.title);
  const [topic, setTopic] = useState(dict.topic ?? "");
  const [description, setDescription] = useState(dict.description ?? "");
  const [rows, setRows] = useState<CustomDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let alive = true;
    listCustomEntries(dict.id)
      .then((entries) => {
        if (!alive) return;
        setRows([...entries.map(dictEntryToDraft), emptyDraft()]);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setStatus(e.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dict.id]);

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const n = await saveCustomDict(dict.id, pair, { title, description, topic }, rows);
      setStatus(`Đã lưu · ${n} từ.`);
      onSaved?.();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const wordCount = rows.filter(isDraftFilled).length;

  return (
    <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manager-card" role="dialog" aria-label="Sửa từ điển cá nhân">
        <header className="manager-head">
          <h2>Sửa “{dict.title}”</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}>×</button>
        </header>

        <div className="manager-body">
          <div className="cd-meta">
            <label>
              Tên
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              Chủ đề
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="tuỳ chọn" />
            </label>
            <label>
              Mô tả
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="tuỳ chọn" />
            </label>
          </div>

          <p className="cd-help muted">
            Sửa trực tiếp trong lưới; xoá từ bằng nút × cuối hàng; Enter để thêm hàng. Nghĩa nhiều nét ngăn bằng “;”.
          </p>

          {loading ? (
            <p className="muted">Đang tải…</p>
          ) : (
            <ManualGrid rows={rows} onChange={setRows} isJa={pair.source === "ja"} />
          )}

          {status && <p className="dict-status">{status}</p>}
        </div>

        <footer className="cd-footer">
          <span className="muted">{wordCount} từ</span>
          <button className="primary" disabled={saving || loading || !title.trim()} onClick={save}>
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </footer>
      </div>
    </div>
  );
}
