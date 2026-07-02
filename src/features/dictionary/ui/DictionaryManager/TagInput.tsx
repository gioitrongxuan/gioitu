// Ô nhập tag dạng chip (từ loại / nhãn cách dùng): hiện các mã đã chọn kèm nút
// xoá, gõ thêm mã bất kỳ (Enter hoặc dấu phẩy). Có gợi ý qua <datalist> nhưng
// không ép chọn — mã lạ vẫn nhập được, khớp cách Yomitan giữ mã trần.

import { useId, useState } from "react";
import { TagOption, tagLabel } from "../../domain/tag-options";

export function TagInput({
  label,
  codes,
  options,
  onChange,
}: {
  label: string;
  codes: string[];
  options: TagOption[];
  onChange: (codes: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function add(raw: string) {
    const code = raw.trim();
    setDraft("");
    if (!code || codes.includes(code)) return;
    onChange([...codes, code]);
  }

  return (
    <div className="tag-input">
      <span className="field-label">{label}</span>
      <div className="tag-chips">
        {codes.map((c) => (
          <span key={c} className="edit-chip" title={tagLabel(c)}>
            {c}
            <button type="button" className="chip-x" aria-label={`Bỏ ${c}`} onClick={() => onChange(codes.filter((x) => x !== c))}>
              ×
            </button>
          </span>
        ))}
        <input
          className="tag-add"
          list={listId}
          value={draft}
          placeholder="+ thêm"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
          }}
          onBlur={() => add(draft)}
        />
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </datalist>
      </div>
    </div>
  );
}
