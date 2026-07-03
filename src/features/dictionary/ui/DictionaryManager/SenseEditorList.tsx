// Trình soạn danh sách nghĩa dùng chung: mỗi nghĩa gồm từ loại (POS), nhãn cách
// dùng (misc), các dòng nghĩa, câu ví dụ và ghi chú. Lớp nghĩa thủ công
// (TermForm) và nghĩa của từng nguồn đã nhập (ImportedEntryEditor) cùng dùng —
// draft giữ text thô nhiều dòng, chuyển về EditableSense lúc lưu.

import type { EditableSense } from "@/shared/dictionary";
import { MISC_OPTIONS, POS_OPTIONS } from "../../domain/tag-options";
import { TagInput } from "./TagInput";

interface Example {
  ja: string;
  vi: string;
}
export interface SenseDraft {
  pos: string[];
  misc: string[];
  /** Nhiều dòng — mỗi dòng một nghĩa. */
  gloss: string;
  /** Nhiều dòng — mỗi dòng một ghi chú. */
  info: string;
  examples: Example[];
}

export const emptySense = (): SenseDraft => ({ pos: [], misc: [], gloss: "", info: "", examples: [] });

export function toSenseDrafts(senses: EditableSense[]): SenseDraft[] {
  if (!senses.length) return [emptySense()];
  return senses.map((s) => ({
    pos: s.pos ?? [],
    misc: s.misc ?? [],
    gloss: (s.gloss ?? []).join("\n"),
    info: (s.info ?? []).join("\n"),
    examples: s.examples?.map((e) => ({ ja: e.ja, vi: e.vi })) ?? [],
  }));
}

export function toEditableSenses(drafts: SenseDraft[]): EditableSense[] {
  const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  return drafts.map((d) => ({
    pos: d.pos,
    misc: d.misc,
    gloss: lines(d.gloss),
    info: lines(d.info),
    examples: d.examples.map((e) => ({ ja: e.ja.trim(), vi: e.vi.trim() })).filter((e) => e.ja || e.vi),
  }));
}

export function SenseEditorList({
  senses,
  onChange,
  isJa,
}: {
  senses: SenseDraft[];
  onChange: (senses: SenseDraft[]) => void;
  isJa: boolean;
}) {
  const patchSense = (i: number, patch: Partial<SenseDraft>) =>
    onChange(senses.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const patchExample = (si: number, ei: number, patch: Partial<Example>) =>
    patchSense(si, { examples: senses[si].examples.map((e, idx) => (idx === ei ? { ...e, ...patch } : e)) });

  return (
    <>
      {senses.map((s, i) => (
        <fieldset className="sense-editor" key={i}>
          <legend>
            Nghĩa {i + 1}
            {senses.length > 1 && (
              <button
                type="button"
                className="link danger"
                onClick={() => onChange(senses.filter((_, idx) => idx !== i))}
              >
                Bỏ
              </button>
            )}
          </legend>
          <TagInput label="Từ loại" codes={s.pos} options={POS_OPTIONS} onChange={(pos) => patchSense(i, { pos })} />
          <TagInput label="Cách dùng / sắc thái" codes={s.misc} options={MISC_OPTIONS} onChange={(misc) => patchSense(i, { misc })} />
          <label className="form-field">
            <span className="field-label">Định nghĩa (mỗi dòng một nghĩa)</span>
            <textarea rows={2} value={s.gloss} onChange={(e) => patchSense(i, { gloss: e.target.value })} />
          </label>

          <div className="examples-editor">
            <span className="field-label">Ví dụ</span>
            {s.examples.map((ex, ei) => (
              <div className="example-row" key={ei}>
                <input
                  lang={isJa ? "ja" : undefined}
                  placeholder="Câu ví dụ"
                  value={ex.ja}
                  onChange={(e) => patchExample(i, ei, { ja: e.target.value })}
                />
                <input
                  placeholder="Bản dịch"
                  value={ex.vi}
                  onChange={(e) => patchExample(i, ei, { vi: e.target.value })}
                />
                <button
                  type="button"
                  className="link danger"
                  aria-label="Bỏ ví dụ"
                  onClick={() => patchSense(i, { examples: s.examples.filter((_, idx) => idx !== ei) })}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="link" onClick={() => patchSense(i, { examples: [...s.examples, { ja: "", vi: "" }] })}>
              + Ví dụ
            </button>
          </div>

          <label className="form-field">
            <span className="field-label">Ghi chú (tùy chọn)</span>
            <textarea rows={1} value={s.info} onChange={(e) => patchSense(i, { info: e.target.value })} />
          </label>
        </fieldset>
      ))}
      <button type="button" className="link" onClick={() => onChange([...senses, emptySense()])}>
        + Thêm nghĩa
      </button>
    </>
  );
}
