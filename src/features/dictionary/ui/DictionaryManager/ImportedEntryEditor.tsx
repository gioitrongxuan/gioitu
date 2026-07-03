// Sửa nghĩa của MỘT nguồn đã nhập (Mazii/Yomitan…) — mỗi nguồn là một dòng
// entry riêng nên lưu độc lập với lớp nghĩa thủ công của TermForm. Sửa xong
// glossary có cấu trúc của nguồn bị thay bằng văn bản thuần (cảnh báo trong UI);
// không đụng thì dữ liệu gốc giữ nguyên.

import { useState } from "react";
import type { ImportedEntryEdit } from "@/shared/dictionary";
import { saveEntrySenses } from "../../data/dictAdmin";
import { SenseDraft, SenseEditorList, toEditableSenses, toSenseDrafts } from "./SenseEditorList";

export function ImportedEntryEditor({
  entry,
  isJa,
  onError,
  onRemoved,
}: {
  entry: ImportedEntryEdit;
  isJa: boolean;
  onError: (s: string | null) => void;
  /** Nguồn bị gỡ khỏi từ (senses rỗng hoặc bấm gỡ). */
  onRemoved: () => void;
}) {
  const [senses, setSensesRaw] = useState<SenseDraft[]>(toSenseDrafts(entry.senses));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const sourceName = entry.dictionary ?? "Nguồn không tên";
  // Sửa tiếp sau khi lưu thì tắt dấu "Đã lưu" để trạng thái không nói dối.
  const setSenses = (next: SenseDraft[]) => {
    setSaved(false);
    setSensesRaw(next);
  };

  async function save() {
    setBusy(true);
    onError(null);
    try {
      const { deleted } = await saveEntrySenses(entry.entry_id, toEditableSenses(senses));
      if (deleted) onRemoved();
      else setSaved(true);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeSource() {
    if (!confirm(`Gỡ toàn bộ nghĩa của nguồn “${sourceName}” khỏi từ này?`)) return;
    setBusy(true);
    onError(null);
    try {
      await saveEntrySenses(entry.entry_id, []);
      onRemoved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="imported-editor">
      <summary>
        <span className="dict-name">{sourceName}</span>
        <span className="muted"> — {entry.senses.length} nghĩa</span>
      </summary>
      <p className="muted imported-note">
        Sửa nghĩa nguồn này sẽ chuyển phần trình bày gốc thành văn bản thuần.
      </p>
      <SenseEditorList senses={senses} onChange={setSenses} isJa={isJa} />
      <div className="form-actions">
        <button className="primary" disabled={busy} onClick={save}>
          Lưu nghĩa nguồn này
        </button>
        <button className="link danger" disabled={busy} onClick={removeSource}>
          Gỡ nguồn khỏi từ
        </button>
        {saved && <span className="verified-badge">✓ Đã lưu</span>}
      </div>
    </details>
  );
}
