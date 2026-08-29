// Thẻ "báo cáo đối chiếu" của một bộ từ: bao nhiêu từ trong bộ mình đã biết,
// bao nhiêu chưa, và ba hành động đi ra từ đó. Đây mới là phần người dùng đến
// để xem — lưới ô chỉ là chi tiết bên dưới.
//
// Hai hành động ghi dữ liệu (đánh dấu hàng loạt, chắt bộ mới) đều đi qua một
// bước xác nhận có nêu SỐ và VÍ DỤ cụ thể (DESIGN §3.9): một cú bấm ở đây đổi
// trạng thái hàng trăm thẻ, không được để nó xảy ra trước khi người dùng thấy
// mình sắp đổi gì.

import { ReactNode, useState } from "react";
import { VocabListWord, ProgressCounts, percent } from "../domain/vocablist";

interface Props {
  counts: ProgressCounts;
  /** Số từ ghép được nhưng chưa chắc — nhóm cần duyệt bằng mắt. */
  uncertain: number;
  hideKnown: boolean;
  onHideKnown: (v: boolean) => void;
  onReviewUncertain: () => void;
  /** Từ đang hiển thị mà chưa được đánh dấu thuộc — đối tượng của đánh dấu hàng loạt. */
  markable: VocabListWord[];
  onMarkKnown: (words: VocabListWord[]) => Promise<number>;
  /** Số từ sẽ nằm trong bản chắt (đúng bằng số ô đang hiển thị). */
  splitCount: number;
  onSplit: () => Promise<void>;
}

/** Số từ nêu tên trong hộp xác nhận — đủ để nhận ra mình đang chọn đúng nhóm. */
const PREVIEW_TERMS = 8;

export function WordsetSummary({
  counts,
  uncertain,
  hideKnown,
  onHideKnown,
  onReviewUncertain,
  markable,
  onMarkKnown,
  splitCount,
  onSplit,
}: Props) {
  const [confirming, setConfirming] = useState<"mark" | "split" | null>(null);
  const [busy, setBusy] = useState(false);
  const knownPct = percent(counts.learned, counts.total);

  const run = async (job: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await job();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <div className="wordset-summary">
      <p className="kanji-summary">
        Đã thuộc <b>{counts.learned}</b>/{counts.total} <span className="muted">({knownPct}%)</span> · đang học{" "}
        {counts.learning} · cần ôn {counts.due} · chưa học {counts.missing}
      </p>
      <div className="kanji-progress" title={`Đã thuộc ${knownPct}%`}>
        <div className="kanji-progress-fill" style={{ width: `${knownPct}%` }} />
      </div>

      {uncertain > 0 && (
        <p className="wordset-uncertain">
          <b>{uncertain}</b> từ <i>có thể</i> bạn đã biết — khớp qua cách đọc, khác okurigana hoặc dạng chia, nên chưa
          ẩn đi.{" "}
          <button className="link" onClick={onReviewUncertain}>
            Duyệt nhóm này
          </button>
        </p>
      )}

      <div className="kanji-controls">
        <label className="kanji-check">
          <input type="checkbox" checked={hideKnown} onChange={(e) => onHideKnown(e.target.checked)} />
          Ẩn từ đã thuộc
        </label>
        <button
          className="export-btn"
          disabled={busy || markable.length === 0}
          onClick={() => setConfirming("mark")}
        >
          Đánh dấu {markable.length} từ đang hiện là đã thuộc
        </button>
        <button className="export-btn" disabled={busy || splitCount === 0} onClick={() => setConfirming("split")}>
          Tách {splitCount} từ đang hiện thành bộ riêng
        </button>
      </div>

      {confirming === "mark" && (
        <ConfirmBar
          busy={busy}
          question={`Đánh dấu ${markable.length} từ là đã thuộc?`}
          detail={
            <>
              Gồm {sampleTerms(markable)}. Chúng sẽ không còn xuất hiện trong hàng ôn. Bấm nhầm thì hoàn tác được ngay
              ở thông báo sau đó.
            </>
          }
          onCancel={() => setConfirming(null)}
          onConfirm={() => void run(() => onMarkKnown(markable))}
        />
      )}

      {confirming === "split" && (
        <ConfirmBar
          busy={busy}
          question={`Tạo một bộ mới gồm ${splitCount} từ đang hiện?`}
          detail={
            <>
              Bản chắt là ảnh chụp tại thời điểm này — nó KHÔNG tự cập nhật khi bạn thuộc thêm từ. Muốn con số luôn
              đúng thì cứ để nguyên bộ gốc và dùng bộ lọc.
            </>
          }
          onCancel={() => setConfirming(null)}
          onConfirm={() => void run(onSplit)}
        />
      )}
    </div>
  );
}

/** Vài từ đầu làm mẫu, để người dùng nhận ra nhóm mình đang thao tác. */
function sampleTerms(words: VocabListWord[]): string {
  const head = words.slice(0, PREVIEW_TERMS).map((w) => w.term).join(", ");
  return words.length > PREVIEW_TERMS ? `${head}…` : head;
}

function ConfirmBar({
  question,
  detail,
  busy,
  onConfirm,
  onCancel,
}: {
  question: string;
  detail: ReactNode;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="wordset-confirm">
      <p className="wordset-confirm-q">{question}</p>
      <p className="muted">{detail}</p>
      <div className="wordset-actions">
        <button className="primary" disabled={busy} onClick={onConfirm}>
          {busy ? "Đang chạy…" : "Xác nhận"}
        </button>
        <button className="link" disabled={busy} onClick={onCancel}>
          Huỷ
        </button>
      </div>
    </div>
  );
}
