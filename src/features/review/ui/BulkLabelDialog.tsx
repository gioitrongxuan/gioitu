// Gắn nhãn hàng loạt bằng AI cho những từ ĐANG ĐƯỢC LỌC trên bản đồ (#249).
// Mở từ Filter Bar, nên tập từ đi vào đây đã qua đúng bộ lọc mà người dùng nhìn
// thấy (ngôn ngữ · nhãn · "thêm trong" · chỉ-từ-cần-ôn).
//
// Hai nhịp, cố ý không gộp: **hỏi AI** rồi mới **áp dụng**. Đây là thao tác ghi
// lên hàng chục thẻ một lúc, mà nhãn sai thì phải mở từng thẻ ra gỡ — nên mọi
// nhãn đề xuất hiện thành chip bật/tắt để duyệt trước, mặc định bật, và không
// có gì được ghi cho tới khi bấm "Áp dụng".

import { useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon } from "@/shared/ui/icons";
import { VocabEntry } from "@/shared/types";
import { meaningToLines } from "@/shared/meaning";
import { entryLabels, mergeLabels, LabelCount } from "../domain/labels";
import {
  batchItems,
  proposeBulkLabels,
  BulkLabelSuggestion,
  LabelProposal,
  MAX_BULK_LABEL_ENTRIES,
} from "../domain/bulkLabels";
import { suggestLabelsForBatch } from "../data/aiLabels";
import "./review.css";
import "./labels.css";

interface Props {
  /** Các từ đang hiển thị trên bản đồ, đúng theo bộ lọc hiện hành. */
  entries: VocabEntry[];
  /** Nhãn đã dùng trong kho — vốn từ gửi cho AI để nó tái dùng thay vì đẻ nhãn mới. */
  known: LabelCount[];
  onApply: (changes: { entry: VocabEntry; labels: string[] }[]) => void;
  onClose: () => void;
}

/** Vốn nhãn gửi kèm prompt — nhiều hơn bản một-thẻ vì lô nào cũng cần gợi lại. */
const AI_LABEL_VOCABULARY = 30;

const entryKey = (entry: VocabEntry) => `${entry.term}:${entry.term_lang}`;

export function BulkLabelDialog({ entries, known, onApply, onClose }: Props) {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [proposals, setProposals] = useState<LabelProposal<VocabEntry>[] | null>(null);
  // Nhãn người dùng bỏ chọn, khoá "<từ>:<ngôn ngữ>|<nhãn>" — bỏ chọn là ngoại lệ
  // nên giữ danh sách loại trừ, mặc định mọi nhãn đều được nhận.
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  // Lô đã hỏi xong / tổng số lô: đủ để vẽ tiến độ mà không cần state riêng.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Đóng hộp thoại giữa chừng thì dừng luôn các lô chưa hỏi: người dùng đã bỏ
  // cuộc, hỏi tiếp chỉ tốn quota model cho một kết quả không ai nhìn.
  const closed = useRef(false);
  useEffect(() => () => {
    closed.current = true;
  }, []);

  // Quá trần thì cắt phần đuôi — và nói rõ đã cắt bao nhiêu, không lặng lẽ bỏ.
  const targets = useMemo(() => entries.slice(0, MAX_BULK_LABEL_ENTRIES), [entries]);
  const skipped = entries.length - targets.length;
  const vocabulary = useMemo(
    () => known.slice(0, AI_LABEL_VOCABULARY).map((k) => k.label),
    [known],
  );

  const asking = progress != null && progress.done < progress.total;
  // Tiến độ đếm theo LÔ chứ không theo từ: một lô là một lượt gọi model, nên đó
  // mới là nhịp người dùng thấy thanh chạy.
  const askLabel = asking
    ? `Đang hỏi AI… (${progress.done}/${progress.total})`
    : proposals
      ? "Hỏi lại AI"
      : "Nhờ AI gợi ý";

  const rejectKey = (entry: VocabEntry, label: string) => `${entryKey(entry)}|${label}`;
  const toggle = (entry: VocabEntry, label: string) => {
    const key = rejectKey(entry, label);
    setRejected((set) => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  const accepted = (proposals ?? []).map((p) => ({
    ...p,
    added: p.added.filter((label) => !rejected.has(rejectKey(p.entry, label))),
  }));
  const changed = accepted.filter((p) => p.added.length > 0);

  const askAi = async () => {
    const batches = batchItems(targets);
    setProgress({ done: 0, total: batches.length });
    setError(null);
    setProposals(null);
    setRejected(new Set());

    const suggestions: BulkLabelSuggestion[] = [];
    const failures: string[] = [];
    for (const batch of batches) {
      if (closed.current) return;
      try {
        suggestions.push(
          ...(await suggestLabelsForBatch(
            batch.map((entry) => ({
              term: entry.term,
              reading: entry.reading,
              meaning: meaningToLines(entry.meaning)[0],
              current: entryLabels(entry),
            })),
            vocabulary,
          )),
        );
      } catch (e) {
        // Một lô hỏng (mạng chập, model trả rác) không nên vứt các lô đã xong:
        // gom lại, báo ở cuối, vẫn bày kết quả thu được.
        failures.push((e as Error).message);
      }
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    if (closed.current) return;

    const found = proposeBulkLabels(targets, suggestions);
    setProposals(found);
    // Một thông báo duy nhất ở cuối, không nhấp nháy lỗi giữa chừng rồi bị đè.
    if (failures.length > 0) {
      setError(
        `${failures.length}/${batches.length} lượt hỏi AI bị lỗi (${failures[0]}). ` +
          "Phần dưới đây là kết quả của những lượt chạy được.",
      );
    } else if (found.length === 0) {
      setError("AI không gợi ý được nhãn mới nào cho các từ đang lọc.");
    }
  };

  const apply = () => {
    onApply(
      changed.map(({ entry, current, added }) => ({ entry, labels: mergeLabels(current, added) })),
    );
  };

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="theme-card"
        role="dialog"
        aria-modal="true"
        aria-label="Gắn nhãn hàng loạt bằng AI"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="manager-head">
          <h2>Gắn nhãn hàng loạt bằng AI</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        <section className="theme-section">
          <p className="yk-hint">
            AI sẽ đề xuất nhãn cho <strong>{targets.length}</strong> từ đang hiển thị trên bản đồ
            (theo bộ lọc hiện tại). Không có gì được ghi cho tới khi bấm “Áp dụng”.
          </p>
          {skipped > 0 && (
            <p className="yk-hint">
              Mỗi lượt chỉ xử tối đa {MAX_BULK_LABEL_ENTRIES} từ — {skipped} từ còn lại chưa được
              hỏi. Thu hẹp bộ lọc rồi chạy tiếp để gắn nốt.
            </p>
          )}
          <div className="bulk-label-actions">
            <button type="button" className="primary" onClick={askAi} disabled={asking || targets.length === 0}>
              {askLabel}
            </button>
          </div>
          {error && <p className="yk-error">{error}</p>}
        </section>

        {proposals != null && proposals.length > 0 && (
          <section className="theme-section">
            <p className="yk-hint">
              Bấm vào một nhãn để bỏ chọn nhãn đó. Nhãn xám bên trái là nhãn thẻ đã có.
            </p>
            <ul className="bulk-label-list">
              {proposals.map((p) => (
                <li className="bulk-label-row" key={entryKey(p.entry)}>
                  <span className="bulk-label-term" lang={p.entry.term_lang === "ja" ? "ja" : undefined}>
                    {p.entry.term}
                  </span>
                  <span className="label-chips">
                    {p.current.map((label) => (
                      <span className="label-chip bulk-label-current" key={`cur:${label}`}>{label}</span>
                    ))}
                    {p.added.map((label) => {
                      const on = !rejected.has(rejectKey(p.entry, label));
                      return (
                        <button
                          type="button"
                          key={label}
                          className={`chip-toggle${on ? " on" : ""}`}
                          aria-pressed={on}
                          onClick={() => toggle(p.entry, label)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="label-actions">
          <button type="button" className="chip-toggle" onClick={onClose}>Huỷ</button>
          <button type="button" className="primary" onClick={apply} disabled={asking || changed.length === 0}>
            Áp dụng cho {changed.length} từ
          </button>
        </footer>
      </div>
    </div>
  );
}
