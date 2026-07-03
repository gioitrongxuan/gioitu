// Form sửa/thêm một từ trên từ điển server, bao trọn MỌI thứ app render khi tra:
// cách đọc, Hán-Việt, JLPT, pitch accent, lớp nghĩa thủ công (nhiều nghĩa — POS/
// misc/định nghĩa/ví dụ/ghi chú), nghĩa của từng nguồn đã nhập, ảnh minh hoạ,
// bình luận, và cờ kiểm duyệt (tích xanh). Dùng chung cho "thêm mới" (mode="new")
// lẫn "sửa" (mode="edit"). Nút Lưu chỉ ghi lớp thủ công + thuộc tính cấp từ
// (PUT /dict/term); duyệt/nguồn nhập/ảnh/bình luận là hành động tức thời.

import { useState } from "react";
import { LangPair } from "@/shared/languages";
import type { JlptLevel, PitchAccent, TermEditState } from "@/shared/dictionary";
import {
  addTermImage,
  deleteTermComment,
  deleteTermImage,
  saveTerm,
  setTermVerified,
} from "../../data/dictAdmin";
import { accentDrop, accentPattern, splitMoras } from "../../domain/pitch";
import { PitchView } from "../PitchView";
import { ImportedEntryEditor } from "./ImportedEntryEditor";
import { SenseDraft, SenseEditorList, toEditableSenses, toSenseDrafts } from "./SenseEditorList";

/** Pitch nhập bằng vị trí xuống giọng (dễ hơn gõ chuỗi L/H); dựng pattern lúc lưu. */
interface PitchDraft {
  kana: string;
  drop: string;
}

const JLPT_LEVELS: JlptLevel[] = [5, 4, 3, 2, 1];

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
  const wordId = initial?.word_id;
  const [term, setTerm] = useState(initial?.term ?? "");
  const [reading, setReading] = useState(initial?.reading ?? "");
  const [hanViet, setHanViet] = useState(initial?.hanViet ?? "");
  const [jlpt, setJlpt] = useState(initial?.jlpt ? String(initial.jlpt) : "");
  const [pitches, setPitches] = useState<PitchDraft[]>(toPitchDrafts(initial?.pitch));
  const [senses, setSenses] = useState<SenseDraft[]>(toSenseDrafts(initial?.senses ?? []));
  const [busy, setBusy] = useState(false);

  // Các phần tức-thời (không đi qua nút Lưu): trạng thái cục bộ đồng bộ tay với
  // server sau mỗi hành động thành công.
  const [verified, setVerified] = useState(initial?.verified === true);
  const [imported, setImported] = useState(initial?.imported ?? []);
  const [images, setImages] = useState(initial?.images ?? []);
  const [comments, setComments] = useState(initial?.comments ?? []);
  const [newImageUrl, setNewImageUrl] = useState("");

  async function submit() {
    const t = term.trim();
    const editableSenses = toEditableSenses(senses);
    if (!t) {
      onError("Cần nhập từ");
      return;
    }
    // Từ có nguồn nhập vẫn hợp lệ khi lớp thủ công trống; từ mới thì phải có nghĩa.
    const manualEmpty = !editableSenses.some((s) => s.gloss.length > 0);
    if (manualEmpty && imported.length === 0) {
      onError("Cần ít nhất một nghĩa");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await saveTerm({
        word_id: wordId,
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

  async function toggleVerified() {
    if (!wordId) return;
    setBusy(true);
    onError(null);
    try {
      const res = await setTermVerified(wordId, !verified);
      setVerified(res.verified);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addImage() {
    const url = newImageUrl.trim();
    if (!wordId || !url) return;
    setBusy(true);
    onError(null);
    try {
      const image = await addTermImage(wordId, url);
      setImages((prev) => (prev.some((i) => i.id === image.id) ? prev : [...prev, image]));
      setNewImageUrl("");
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(id: string) {
    onError(null);
    try {
      await deleteTermImage(id);
      setImages((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      onError((err as Error).message);
    }
  }

  async function removeComment(id: string) {
    onError(null);
    try {
      await deleteTermComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      onError((err as Error).message);
    }
  }

  return (
    <div className="term-form">
      {/* Cờ kiểm duyệt — hành động tức thời, chỉ với từ đã tồn tại. */}
      {wordId && (
        <div className="verify-row">
          {verified ? (
            <span className="verified-badge" title="Từ đã được kiểm duyệt">✓ Đã kiểm duyệt</span>
          ) : (
            <span className="muted">Chưa kiểm duyệt</span>
          )}
          <button type="button" className="link" disabled={busy} onClick={toggleVerified}>
            {verified ? "Bỏ duyệt" : "Duyệt từ này"}
          </button>
        </div>
      )}

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

      {/* Lớp nghĩa thủ công: nhiều sense, mỗi sense gồm POS / cách dùng / định nghĩa / ví dụ / ghi chú. */}
      <div className="senses-editor">
        <span className="field-label">Nghĩa{imported.length > 0 ? " (thủ công)" : ""}</span>
        <SenseEditorList senses={senses} onChange={setSenses} isJa={isJa} />
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

      {/* Nghĩa của từng nguồn đã nhập — sửa/gỡ độc lập với lớp thủ công. */}
      {imported.length > 0 && (
        <div className="imported-editors">
          <span className="field-label">Nghĩa từ từ điển đã nhập</span>
          {imported.map((entry) => (
            <ImportedEntryEditor
              key={entry.entry_id}
              entry={entry}
              isJa={isJa}
              onError={onError}
              onRemoved={() => setImported((prev) => prev.filter((e) => e.entry_id !== entry.entry_id))}
            />
          ))}
        </div>
      )}

      {/* Ảnh minh hoạ — gỡ ảnh sai/hỏng, thêm ảnh bằng URL. */}
      {wordId && (
        <div className="media-editor">
          <span className="field-label">Ảnh minh hoạ</span>
          {images.length > 0 && (
            <div className="word-images">
              {images.map((im) => (
                <span className="word-image editable" key={im.id}>
                  <img src={im.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <button
                    type="button"
                    className="link danger"
                    aria-label="Gỡ ảnh"
                    title="Gỡ ảnh"
                    onClick={() => removeImage(im.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="example-row">
            <input
              placeholder="https://… (URL ảnh)"
              value={newImageUrl}
              onChange={(e) => setNewImageUrl(e.target.value)}
            />
            <button type="button" className="link" disabled={busy || !newImageUrl.trim()} onClick={addImage}>
              + Thêm ảnh
            </button>
          </div>
        </div>
      )}

      {/* Bình luận cộng đồng — chỉ gỡ (kiểm duyệt), không sửa nội dung hộ người khác. */}
      {comments.length > 0 && (
        <div className="media-editor">
          <span className="field-label">Bình luận ({comments.length})</span>
          <ul className="comment-moderation">
            {comments.map((c) => (
              <li key={c.id}>
                <span className="comment-mean">{c.mean}</span>
                {c.author && <span className="muted"> — {c.author}</span>}
                <button
                  type="button"
                  className="link danger"
                  aria-label="Gỡ bình luận"
                  title="Gỡ bình luận"
                  onClick={() => removeComment(c.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
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
