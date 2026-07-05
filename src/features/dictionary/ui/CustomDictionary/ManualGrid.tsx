// Lưới nhập kiểu bảng tính cho Từ điển cá nhân (Issue #69, Tab A) — cũng dùng
// làm lưới xem trước (cùng state). Mỗi ô là một <input> một dòng, nên Tab nhảy
// sang ô kế là hành vi mặc định của trình duyệt; ta chỉ thêm: Enter tạo hàng
// mới ngay dưới rồi đưa con trỏ vào đó. Xoá hàng bằng nút × cuối mỗi hàng.

import { useRef } from "react";
import { CustomDraft, emptyDraft } from "../../domain/customEntry";

interface Column {
  key: keyof CustomDraft;
  label: string;
  /** Ô chứa văn bản nguồn (đánh dấu lang="ja" khi tra tiếng Nhật). */
  langSource?: boolean;
  placeholder?: string;
}

const COLUMNS: Column[] = [
  { key: "term", label: "Từ", langSource: true, placeholder: "cách viết" },
  { key: "reading", label: "Cách đọc", langSource: true, placeholder: "kana / phiên âm" },
  { key: "pos", label: "Từ loại", placeholder: "n, v5k…" },
  { key: "gloss", label: "Nghĩa", placeholder: "nghĩa 1; nghĩa 2" },
  { key: "example", label: "Ví dụ", langSource: true, placeholder: "câu :: bản dịch" },
  { key: "note", label: "Giải thích", placeholder: "ghi chú cách dùng" },
  { key: "related", label: "Liên quan / dễ nhầm", placeholder: "từ A; từ B" },
];

export function ManualGrid({
  rows,
  onChange,
  isJa,
}: {
  rows: CustomDraft[];
  onChange: (rows: CustomDraft[]) => void;
  isJa: boolean;
}) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const focusCell = (row: number, col: number) => {
    const el = bodyRef.current?.querySelector<HTMLInputElement>(
      `input[data-row="${row}"][data-col="${col}"]`,
    );
    el?.focus();
  };

  const patch = (row: number, key: keyof CustomDraft, value: string) =>
    onChange(rows.map((r, i) => (i === row ? { ...r, [key]: value } : r)));

  const insertRowAfter = (row: number, col: number) => {
    onChange([...rows.slice(0, row + 1), emptyDraft(), ...rows.slice(row + 1)]);
    // Đợi React vẽ hàng mới rồi mới focus vào cùng cột.
    requestAnimationFrame(() => focusCell(row + 1, col));
  };

  const removeRow = (row: number) => {
    const next = rows.filter((_, i) => i !== row);
    onChange(next.length ? next : [emptyDraft()]);
  };

  return (
    <div className="custom-grid-wrap">
      <table className="custom-grid">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
            <th aria-label="Xoá" />
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {COLUMNS.map((c, ci) => (
                <td key={c.key}>
                  <input
                    data-row={ri}
                    data-col={ci}
                    lang={isJa && c.langSource ? "ja" : undefined}
                    placeholder={ri === 0 ? c.placeholder : undefined}
                    value={row[c.key]}
                    onChange={(e) => patch(ri, c.key, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        insertRowAfter(ri, ci);
                      }
                    }}
                  />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className="link danger row-x"
                  aria-label={`Xoá hàng ${ri + 1}`}
                  onClick={() => removeRow(ri)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="link" onClick={() => insertRowAfter(rows.length - 1, 0)}>
        + Thêm hàng
      </button>
    </div>
  );
}
