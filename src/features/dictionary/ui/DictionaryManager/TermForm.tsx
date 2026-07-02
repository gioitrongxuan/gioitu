// Form sửa/thêm một từ trên từ điển server, bao trọn thuộc tính từ vựng mà app
// render: cách đọc, Hán-Việt, JLPT, pitch accent, và NHIỀU nghĩa — mỗi nghĩa có
// từ loại (POS), nhãn cách dùng (misc), các dòng nghĩa, câu ví dụ và ghi chú.
// Dùng chung cho cả "thêm mới" (mode="new") lẫn "sửa" (mode="edit"); phần lưu đi
// qua saveTerm → PUT /dict/term (lớp nghĩa thủ công, dict_id NULL).

import { useState } from "react";
import { LangPair } from "@/shared/languages";
import type { EditableSense, JlptLevel, PitchAccent, TermEditState } from "@/shared/dictionary";
import { saveTerm } from "../../data/dictAdmin";
import { accentDrop, accentPattern, splitMoras } from "../../domain/pitch";
import { MISC_OPTIONS, POS_OPTIONS } from "../../domain/tag-options";
import { PitchView } from "../PitchView";
import { TagInput } from "./TagInput";

interface Example {
  ja: string;
  vi: string;
}
interface SenseDraft {
  pos: string[];
  misc: string[];
  /** Nhiều dòng — mỗi dòng một nghĩa. */
  gloss: string;
  /** Nhiều dòng — mỗi dòng một ghi chú. */
  info: string;
  examples: Example[];
}
/** Pitch nhập bằng vị trí xuống giọng (dễ hơn gõ chuỗi L/H); dựng pattern lúc lưu. */
interface PitchDraft {
  kana: string;
  drop: string;
}

const JLPT_LEVELS: JlptLevel[] = [5, 4, 3, 2, 1];

const emptySense = (): SenseDraft => ({ pos: [], misc: [], gloss: "", info: "", examples: [] });

function toSenseDrafts(senses: EditableSense[]): SenseDraft[] {
  if (!senses.length) return [emptySense()];
  return senses.map((s) => ({
    pos: s.pos ?? [],
    misc: s.misc ?? [],
    gloss: (s.gloss ?? []).join("\n"),
    info: (s.info ?? []).join("\n"),
    examples: s.examples?.map((e) => ({ ja: e.ja, vi: e.vi })) ?? [],
  }));
}

function toEditableSenses(drafts: SenseDraft[]): EditableSense[] {
  const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  return drafts.map((d) => ({
    pos: d.pos,
    misc: d.misc,
    gloss: lines(d.gloss),
    info: lines(d.info),
    examples: d.examples.map((e) => ({ ja: e.ja.trim(), vi: e.vi.trim() })).filter((e) => e.ja || e.vi),
  }));
}

function toPitchDrafts(pitch: PitchAccent[] | undefined): PitchDraft[] {
  return (pitch ?? []).map((p) => ({ kana: p.kana ?? "", drop: String(accentDrop(p.accent, p.moras ?? [])) }));
}

/** (kana, vị trí xuống giọng) → PitchAccent để lưu + xem trước. Bỏ mục thiếu kana. */
function buildPitch(drafts: PitchDraft[]): PitchAccent[] {
  const out: PitchAccent[] = [];
  for (const d of drafts) {
    const kana = d.kana.trim();
    if (!kana) continue;
    const moras = splitMoras(kana);
    const drop = Math.max(0, Math.min(Number(d.drop) || 0, moras.length));
    out.push({ kana, accent: accentPattern(moras.length, drop), moras });
  }
  return out;
}

export function TermForm({
  pair,
  mode,
  initial,
  onDone,
  onCancel,
  onError,
}: {
  pair: LangPair;
  mode: "new" | "edit";
  initial?: TermEditState;
  onDone: () => void;
  onCancel?: () => void;
  onError: (s: string | null) => void;
}) {
  const isJa = pair.source === "ja";
  const [term, setTerm] = useState(initial?.term ?? "");
  const [reading, setReading] = useState(initial?.reading ?? "");
  const [hanViet, setHanViet] = useState(initial?.hanViet ?? "");
  const [jlpt, setJlpt] = useState(initial?.jlpt ? String(initial.jlpt) : "");
  const [pitches, setPitches] = useState<PitchDraft[]>(toPitchDrafts(initial?.pitch));
  const [senses, setSenses] = useState<SenseDraft[]>(toSenseDrafts(initial?.senses ?? []));
  const [busy, setBusy] = useState(false);

  const patchSense = (i: number, patch: Partial<SenseDraft>) =>
    setSenses((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const patchExample = (si: number, ei: number, patch: Partial<Example>) =>
    patchSense(si, { examples: senses[si].examples.map((e, idx) => (idx === ei ? { ...e, ...patch } : e)) });

  async function submit() {
    const t = term.trim();
    const editableSenses = toEditableSenses(senses);
    if (!t) {
      onError("Cần nhập từ");
      return;
    }
    if (!editableSenses.some((s) => s.gloss.length > 0)) {
      onError("Cần ít nhất một nghĩa");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await saveTerm({
        word_id: initial?.word_id,
        term: t,
        term_lang: pair.source,
        native_lang: pair.target,
        reading: reading.trim() || undefined,
        hanViet: hanViet.trim() || undefined,
        jlpt: jlpt ? (Number(jlpt) as JlptLevel) : undefined,
        pitch: isJa ? buildPitch(pitches) : undefined,
        senses: editableSenses,
      });
      onDone();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="term-form">
      {/* Cách viết (base) + cách đọc: base khoá khi sửa (đổi base = từ khác). */}
      <div className="form-row">
        <label className="form-field">
          <span className="field-label">Từ</span>
          {mode === "new" ? (
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Cách viết" />
          ) : (
            <b className="static-term">{term}</b>
          )}
        </label>
        <label className="form-field">
          <span className="field-label">Cách đọc</span>
          <input value={reading} onChange={(e) => setReading(e.target.value)} placeholder="kana / phiên âm" />
        </label>
      </div>

      <div className="form-row">
        {isJa && (
          <label className="form-field">
            <span className="field-label">Hán-Việt</span>
            <input value={hanViet} onChange={(e) => setHanViet(e.target.value)} placeholder="vd: HỌC TẬP" />
          </label>
        )}
        {isJa && (
          <label className="form-field">
            <span className="field-label">JLPT</span>
            <select value={jlpt} onChange={(e) => setJlpt(e.target.value)}>
              <option value="">—</option>
              {JLPT_LEVELS.map((n) => (
                <option key={n} value={n}>
                  N{n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Nghĩa: nhiều sense, mỗi sense gồm POS / cách dùng / các dòng nghĩa / ví dụ / ghi chú. */}
      <div className="senses-editor">
        <span className="field-label">Nghĩa</span>
        {senses.map((s, i) => (
          <fieldset className="sense-editor" key={i}>
            <legend>
              Nghĩa {i + 1}
              {senses.length > 1 && (
                <button
                  type="button"
                  className="link danger"
                  onClick={() => setSenses((prev) => prev.filter((_, idx) => idx !== i))}
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
        <button type="button" className="link" onClick={() => setSenses((prev) => [...prev, emptySense()])}>
          + Thêm nghĩa
        </button>
      </div>

      {/* Pitch accent — chỉ từ tiếng Nhật; nhập vị trí xuống giọng, xem trước sơ đồ. */}
      {isJa && (
        <details className="pitch-editor">
          <summary>Pitch accent (giọng cao thấp)</summary>
          {pitches.map((p, i) => (
            <div className="pitch-row" key={i}>
              <input
                lang="ja"
                placeholder="kana"
                value={p.kana}
                onChange={(e) => setPitches((prev) => prev.map((x, idx) => (idx === i ? { ...x, kana: e.target.value } : x)))}
              />
              <input
                type="number"
                min={0}
                placeholder="số"
                title="Vị trí xuống giọng (0 = bằng)"
                value={p.drop}
                onChange={(e) => setPitches((prev) => prev.map((x, idx) => (idx === i ? { ...x, drop: e.target.value } : x)))}
              />
              <PitchView pitch={buildPitch([p])} />
              <button
                type="button"
                className="link danger"
                aria-label="Bỏ pitch"
                onClick={() => setPitches((prev) => prev.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="link"
            onClick={() => setPitches((prev) => [...prev, { kana: reading, drop: "0" }])}
          >
            + Pitch
          </button>
        </details>
      )}

      {/* Nghĩa từ từ điển đã nhập (read-only) — để đối chiếu, tránh nhập trùng. */}
      {initial?.imported && initial.imported.length > 0 && (
        <div className="imported-preview">
          <span className="field-label">Từ từ điển đã nhập (không sửa được)</span>
          {initial.imported.map((im, i) => (
            <div className="imported-sense" key={i}>
              {im.dictionary && <span className="dict-name">{im.dictionary}</span>}
              <span>{im.gloss.join("; ")}</span>
            </div>
          ))}
        </div>
      )}

      <div className="form-actions">
        <button className="primary" disabled={busy} onClick={submit}>
          {mode === "new" ? "Lưu từ" : "Lưu"}
        </button>
        {onCancel && (
          <button className="link" onClick={onCancel}>
            Hủy
          </button>
        )}
      </div>
    </div>
  );
}
