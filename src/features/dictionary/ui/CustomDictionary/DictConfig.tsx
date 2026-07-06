// Bước 1 — cấu hình từ điển (Issue #69). Chọn một từ điển sẵn có trong IndexedDB
// (theo cặp ngôn ngữ đang chọn) để BỔ SUNG, hoặc "Tạo mới" rồi đặt tên +
// metadata. Theo yêu cầu UI/UX: khi chọn từ điển sẵn có thì KHOÁ cặp ngôn ngữ và
// mô tả (chúng thuộc về từ điển đã tạo, không sửa ở đây).

import { LocalDictionary } from "@/shared/db";
import { LANG_PAIRS, LangPair } from "@/shared/languages";

const NEW_DICT = "";

export function DictConfig({
  pair,
  onPairChange,
  dicts,
  existingDictId,
  onSelectDict,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  topic,
  onTopicChange,
}: {
  pair: LangPair;
  onPairChange: (pair: LangPair) => void;
  dicts: LocalDictionary[];
  existingDictId: string;
  onSelectDict: (id: string) => void;
  title: string;
  onTitleChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  topic: string;
  onTopicChange: (v: string) => void;
}) {
  const selected = dicts.find((d) => d.id === existingDictId);
  const isExisting = selected != null;

  return (
    <div className="cd-config">
      <div className="form-row">
        <label className="form-field">
          <span className="field-label">Cặp ngôn ngữ</span>
          <select
            value={pair.id}
            disabled={isExisting}
            onChange={(e) => onPairChange(LANG_PAIRS.find((p) => p.id === e.target.value) ?? pair)}
          >
            {LANG_PAIRS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field grow">
          <span className="field-label">Từ điển</span>
          <select value={existingDictId} onChange={(e) => onSelectDict(e.target.value)}>
            <option value={NEW_DICT}>➕ Tạo từ điển mới…</option>
            {dicts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.termCount} từ){d.custom ? "" : " · đã nhập"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isExisting && !selected!.custom ? (
        <p className="cd-existing-note muted">
          Bổ sung vào “{selected!.title}” (từ điển đã nhập).
          {selected!.topic ? ` · ${selected!.topic}` : ""}
        </p>
      ) : (
        <>
          <label className="form-field">
            <span className="field-label">{isExisting ? "Tên từ điển" : "Tên từ điển mới"}</span>
            <input value={title} onChange={(e) => onTitleChange(e.target.value)} placeholder="vd: Sổ tay của tôi" />
          </label>
          <div className="form-row">
            <label className="form-field grow">
              <span className="field-label">Mô tả (tuỳ chọn)</span>
              <input
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Từ vựng cá nhân…"
              />
            </label>
            <label className="form-field grow">
              <span className="field-label">Chủ đề / lĩnh vực (tuỳ chọn)</span>
              <input value={topic} onChange={(e) => onTopicChange(e.target.value)} placeholder="vd: Ẩm thực" />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
