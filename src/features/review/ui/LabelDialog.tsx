// Hộp thoại gắn nhãn cho một thẻ (#249): chip nhãn đang có, ô thêm nhãn thủ
// công (gợi ý từ nhãn đã dùng trong kho) và nút nhờ AI gợi ý. Mở từ popover của
// thẻ trên Word Cloud.
//
// Thay đổi chỉ ghi khi bấm "Lưu": người dùng còn gỡ/thêm vài nhịp trước khi ưng,
// mà mỗi lần ghi là một lần đẩy đồng bộ (DESIGN §3.9 — phản hồi chỉ xác nhận
// điều đã thực sự xảy ra, nên toast do store bắn sau khi ghi xong).

import { useMemo, useState } from "react";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon, PlusIcon } from "@/shared/ui/icons";
import { VocabEntry } from "@/shared/types";
import { meaningToLines } from "@/shared/meaning";
import {
  addLabel,
  entryLabels,
  removeLabel,
  LabelCount,
  MAX_LABELS_PER_ENTRY,
  MAX_LABEL_LENGTH,
} from "../domain/labels";
import { suggestLabels } from "../data/aiLabels";
// .chip-toggle sống ở review.css — hộp thoại mở được từ popover nên nạp kèm,
// không dựa vào việc Word Cloud đã nạp giúp.
import "./review.css";
import "./labels.css";

interface Props {
  entry: VocabEntry;
  /** Nhãn đã dùng trong kho — vừa là gợi ý gõ, vừa là vốn từ gửi cho AI. */
  known: LabelCount[];
  /** AI cần đăng nhập (endpoint gated) — chưa đăng nhập thì không mời gọi suông. */
  canUseAi: boolean;
  onSave: (labels: string[]) => void;
  onClose: () => void;
}

const AI_LABEL_VOCABULARY = 20;

export function LabelDialog({ entry, known, canUseAi, onSave, onClose }: Props) {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [labels, setLabels] = useState(() => entryLabels(entry));
  const [draft, setDraft] = useState("");
  // Gợi ý AI đứng riêng khỏi `labels`: người dùng bấm từng cái mới nhận.
  const [suggested, setSuggested] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = labels.length >= MAX_LABELS_PER_ENTRY;
  // Nhãn đã có trên thẻ thì không cần gợi ý lại trong danh sách xổ xuống.
  const options = useMemo(
    () => known.map((k) => k.label).filter((l) => !labels.some((x) => x === l)),
    [known, labels],
  );

  const add = (raw: string) => {
    const next = addLabel(labels, raw);
    if (next) setLabels(next);
    setSuggested((list) => list.filter((s) => s !== raw));
  };

  const submitDraft = () => {
    add(draft);
    setDraft("");
  };

  const askAi = async () => {
    setAsking(true);
    setError(null);
    try {
      const found = await suggestLabels({
        term: entry.term,
        reading: entry.reading,
        meaning: meaningToLines(entry.meaning)[0],
        current: labels,
        vocabulary: known.slice(0, AI_LABEL_VOCABULARY).map((k) => k.label),
      });
      const fresh = found.filter((l) => !labels.some((x) => x.toLocaleLowerCase("vi") === l.toLocaleLowerCase("vi")));
      setSuggested(fresh);
      if (fresh.length === 0) setError("AI không gợi ý được nhãn nào mới cho từ này.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="theme-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Nhãn của từ “${entry.term}”`}
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="manager-head">
          <h2>
            Nhãn cho <span lang={entry.term_lang === "ja" ? "ja" : undefined}>{entry.term}</span>
          </h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        <section className="theme-section">
          {labels.length === 0 ? (
            <p className="yk-hint">Thẻ này chưa có nhãn nào. Nhãn giúp lọc bản đồ từ theo chủ đề, trình độ…</p>
          ) : (
            <ul className="label-chips">
              {labels.map((label) => (
                <li key={label}>
                  <span className="label-chip">
                    {label}
                    <button
                      type="button"
                      className="label-chip-remove"
                      aria-label={`Gỡ nhãn ${label}`}
                      onClick={() => setLabels(removeLabel(labels, label))}
                    >
                      <CloseIcon size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form
            className="label-add"
            onSubmit={(e) => {
              e.preventDefault();
              submitDraft();
            }}
          >
            <input
              className="label-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              list="label-options"
              maxLength={MAX_LABEL_LENGTH}
              placeholder="Thêm nhãn…"
              enterKeyHint="done"
              disabled={full}
              aria-label="Nhãn mới"
            />
            <datalist id="label-options">
              {options.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
            <button type="submit" className="chip-toggle" disabled={full || !draft.trim()}>
              <PlusIcon size={14} /> Thêm
            </button>
          </form>
          {full && <p className="yk-hint">Mỗi thẻ giữ tối đa {MAX_LABELS_PER_ENTRY} nhãn — gỡ bớt một nhãn để thêm nhãn khác.</p>}
        </section>

        <section className="theme-section">
          <button type="button" className="chip-toggle" onClick={askAi} disabled={asking || full || !canUseAi}>
            {asking ? "Đang hỏi AI…" : "Gợi ý bằng AI"}
          </button>
          {!canUseAi && <p className="yk-hint">Cần đăng nhập để nhờ AI gợi ý nhãn.</p>}
          {error && <p className="yk-error">{error}</p>}
          {suggested.length > 0 && (
            <ul className="label-chips">
              {suggested.map((label) => (
                <li key={label}>
                  <button type="button" className="chip-toggle" onClick={() => add(label)} disabled={full}>
                    <PlusIcon size={14} /> {label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Vỏ modal (.theme-overlay/.theme-card/.theme-section) là CSS chung ở
            styles.css; hàng nút thì tự lo — .theme-actions là thanh riêng của
            màn Giao diện và chỉ được nạp cùng ThemeSettings (lazy). */}
        <footer className="label-actions">
          <button type="button" className="chip-toggle" onClick={onClose}>Huỷ</button>
          <button type="button" className="primary" onClick={() => onSave(labels)}>Lưu</button>
        </footer>
      </div>
    </div>
  );
}
