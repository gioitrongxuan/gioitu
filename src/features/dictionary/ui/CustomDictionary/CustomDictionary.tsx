// Từ điển cá nhân (Issue #69) — màn quản lý từ điển do người dùng tự soạn vào
// IndexedDB (offline, dùng được cả khi là khách). Luồng: cấu hình (chọn/ tạo từ
// điển + metadata) → nhập tay (lưới) hoặc sinh bằng AI → xem lại trong lưới →
// lưu. Chống trùng chạy lúc lưu: nếu trùng với dữ liệu IndexedDB, hỏi bỏ qua hay
// ghi đè. Logic thuần ở domain/customEntry; I/O ở data/customDict + data/aiGenerate.

import { useCallback, useEffect, useState } from "react";
import { LocalDictionary } from "@/shared/db";
import { LangPair } from "@/shared/languages";
import { listLocalDictionaries } from "../../data/yomitan";
import {
  createLocalDictionary,
  existingTermKeys,
  upsertCustomEntries,
  listCustomEntries,
  saveCustomDict,
} from "../../data/customDict";
import { CustomDraft, dedupe, dictEntryToDraft, emptyDraft, isDraftFilled } from "../../domain/customEntry";
import { DictConfig } from "./DictConfig";
import { ManualGrid } from "./ManualGrid";
import { AiPanel } from "./AiPanel";

interface Props {
  /** Cặp ngôn ngữ khởi tạo (thường là cặp đang tra ở app). */
  pair: LangPair;
  loggedIn: boolean;
  onRequestLogin: () => void;
  onClose: () => void;
  /** Gọi sau khi lưu thành công để app làm mới (đếm từ, tra lại…). */
  onSaved?: () => void;
}

type Tab = "manual" | "ai";

const isBlankRow = (d: CustomDraft): boolean =>
  !d.term && !d.reading && !d.pos && !d.gloss && !d.example && !d.note && !d.related;

export function CustomDictionary({ pair: initialPair, loggedIn, onRequestLogin, onClose, onSaved }: Props) {
  const [pair, setPair] = useState<LangPair>(initialPair);
  const [dicts, setDicts] = useState<LocalDictionary[]>([]);
  const [existingDictId, setExistingDictId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [tab, setTab] = useState<Tab>("manual");
  const [rows, setRows] = useState<CustomDraft[]>([emptyDraft()]);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState<{ fresh: CustomDraft[]; duplicates: CustomDraft[] } | null>(null);

  const refreshDicts = useCallback(() => {
    listLocalDictionaries(pair.source, pair.target).then(setDicts).catch(() => undefined);
  }, [pair]);
  useEffect(refreshDicts, [refreshDicts]);

  // Chọn một từ điển TỰ SOẠN → nạp toàn bộ từ của nó vào lưới để xem & sửa tại
  // chỗ (chế độ sửa). Chọn "Tạo mới" hoặc từ điển ĐÃ NHẬP → lưới trống (chế độ
  // thêm). `dicts` trong deps để sau khi lưu (refreshDicts) lưới đồng bộ lại.
  useEffect(() => {
    let alive = true;
    const sel = dicts.find((d) => d.id === existingDictId);
    if (sel?.custom) {
      setLoading(true);
      listCustomEntries(sel.id)
        .then((entries) => {
          if (!alive) return;
          setRows([...entries.map(dictEntryToDraft), emptyDraft()]);
          setTitle(sel.title);
          setDescription(sel.description ?? "");
          setTopic(sel.topic ?? "");
          setLoading(false);
        })
        .catch(() => alive && setLoading(false));
    } else {
      setRows([emptyDraft()]);
      if (!existingDictId) {
        setTitle("");
        setDescription("");
        setTopic("");
      }
    }
    return () => {
      alive = false;
    };
  }, [existingDictId, dicts]);

  const changePair = (p: LangPair) => {
    setPair(p);
    setExistingDictId(""); // danh sách từ điển đổi theo cặp — bỏ lựa chọn cũ
  };

  // Kết quả AI/parse đổ vào cùng tập `rows`, rồi hiện lưới để rà soát.
  const addRows = (incoming: CustomDraft[]) => {
    setRows((prev) => [...prev.filter((d) => !isBlankRow(d)), ...incoming, emptyDraft()]);
    setTab("manual");
  };

  const filledCount = rows.filter(isDraftFilled).length;

  // Metadata đưa vào prompt AI: lấy từ dict đang chọn, hoặc các ô "tạo mới".
  const selectedDict = dicts.find((d) => d.id === existingDictId);
  // Từ điển tự soạn đang chọn → chế độ XEM & SỬA (lưới đã nạp từ của nó); ngược
  // lại (tạo mới / từ điển đã nhập) → chế độ THÊM như cũ.
  const editMode = selectedDict?.custom === true;
  const promptTitle = selectedDict ? selectedDict.title : title;
  const promptDescription = selectedDict ? selectedDict.description ?? "" : description;
  const promptTopic = selectedDict ? selectedDict.topic ?? "" : topic;

  // Chế độ sửa: lưu "khớp đúng" (thêm/sửa/xoá từng từ + metadata) — không qua
  // dedupe/conflict vì lưới CHÍNH là toàn bộ nội dung từ điển.
  async function saveEdit() {
    if (!title.trim()) {
      setStatus("Tên từ điển không được để trống.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const n = await saveCustomDict(existingDictId, pair, { title, description, topic }, rows);
      setStatus(`Đã lưu · ${n} từ.`);
      refreshDicts();
      onSaved?.();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onSaveClick() {
    if (editMode) return saveEdit();
    setStatus("");
    if (!existingDictId && !title.trim()) {
      setStatus("Hãy đặt tên cho từ điển mới.");
      return;
    }
    const existing = await existingTermKeys(pair.source, pair.target);
    const { fresh, duplicates } = dedupe(rows, existing);
    if (fresh.length === 0 && duplicates.length === 0) {
      setStatus("Chưa có dòng nào hợp lệ (cần có từ và ít nhất một nghĩa).");
      return;
    }
    if (duplicates.length > 0) {
      setConflict({ fresh, duplicates });
      return;
    }
    await commit(fresh);
  }

  async function commit(drafts: CustomDraft[]) {
    setConflict(null);
    if (drafts.length === 0) {
      setStatus("Không có từ để lưu.");
      return;
    }
    setSaving(true);
    try {
      let dictId = existingDictId;
      let dictTitle: string;
      if (!dictId) {
        dictTitle = title.trim();
        dictId = await createLocalDictionary({
          title: dictTitle,
          term_lang: pair.source,
          native_lang: pair.target,
          description,
          topic,
        });
        setExistingDictId(dictId); // lưu xong thì chuyển sang chế độ bổ sung vào chính nó
      } else {
        dictTitle = dicts.find((d) => d.id === dictId)?.title ?? "Từ điển cá nhân";
      }
      const n = await upsertCustomEntries(dictId, dictTitle, pair, drafts);
      setRows([emptyDraft()]);
      setStatus(`Đã lưu ${n} từ vào “${dictTitle}”.`);
      refreshDicts();
      onSaved?.();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manager-card" role="dialog" aria-label="Từ điển cá nhân">
        <header className="manager-head">
          <h2>Từ điển cá nhân</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}>×</button>
        </header>

        <div className="manager-body">
          <DictConfig
            pair={pair}
            onPairChange={changePair}
            dicts={dicts}
            existingDictId={existingDictId}
            onSelectDict={setExistingDictId}
            title={title}
            onTitleChange={setTitle}
            description={description}
            onDescriptionChange={setDescription}
            topic={topic}
            onTopicChange={setTopic}
          />

          <div className="manager-tabs cd-tabs">
            <button className={tab === "manual" ? "active" : ""} onClick={() => setTab("manual")}>
              Nhập tay
            </button>
            <button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}>
              Tạo bằng AI
            </button>
          </div>

          {tab === "manual" ? (
            <>
              <p className="cd-help muted">
                {editMode
                  ? "Sửa trực tiếp trong lưới; xoá từ bằng nút × cuối hàng; Enter để thêm hàng."
                  : "Tab để sang ô kế, Enter để tạo hàng mới. Nghĩa nhiều nét ngăn bằng “;”. Ví dụ dạng “câu :: bản dịch”."}
              </p>
              {loading ? (
                <p className="muted">Đang tải…</p>
              ) : (
                <ManualGrid rows={rows} onChange={setRows} isJa={pair.source === "ja"} />
              )}
            </>
          ) : (
            <AiPanel
              pair={pair}
              dictTitle={promptTitle}
              topic={promptTopic}
              description={promptDescription}
              loggedIn={loggedIn}
              onRequestLogin={onRequestLogin}
              onAddRows={addRows}
            />
          )}

          {status && <p className="dict-status">{status}</p>}
        </div>

        <footer className="cd-footer">
          <span className="muted">{editMode ? `${filledCount} từ` : `${filledCount} từ sẵn sàng lưu`}</span>
          <button
            className="primary"
            disabled={saving || loading || (!editMode && filledCount === 0)}
            onClick={onSaveClick}
          >
            {saving ? "Đang lưu…" : editMode ? "Lưu thay đổi" : "Lưu vào từ điển"}
          </button>
        </footer>

        {conflict && (
          <div className="cd-conflict-backdrop" onClick={(e) => e.target === e.currentTarget && setConflict(null)}>
            <div className="cd-conflict" role="dialog" aria-label="Xử lý từ trùng">
              <p>
                Có <b>{conflict.duplicates.length}</b> từ đã tồn tại trong từ điển trên máy
                {conflict.fresh.length > 0 ? ` và ${conflict.fresh.length} từ mới` : ""}. Bạn muốn làm gì?
              </p>
              <div className="form-actions">
                <button className="primary" onClick={() => commit([...conflict.fresh, ...conflict.duplicates])}>
                  Ghi đè tất cả
                </button>
                <button className="link" disabled={conflict.fresh.length === 0} onClick={() => commit(conflict.fresh)}>
                  Bỏ qua từ trùng{conflict.fresh.length > 0 ? ` (lưu ${conflict.fresh.length})` : ""}
                </button>
                <button className="link" onClick={() => setConflict(null)}>Huỷ</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
