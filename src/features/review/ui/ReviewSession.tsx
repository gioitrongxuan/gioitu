// Flashcard review session (SPEC 4.4): flip card, self-grade with 4 buttons.
// Each button shows the interval it would schedule (computed via the engine).
//
// Khi đã lật, mặt sau ngoài nghĩa cá nhân đã lưu còn có nút "Xem định nghĩa từ
// điển" — tải nghĩa từ các từ điển (kiểu DetailPanel) và render bằng `Definitions`
// ngay trong thẻ, không rời phiên ôn. Lazy: chỉ tải khi bấm, cache cho thẻ hiện tại.

import { useEffect, useMemo, useRef, useState } from "react";
import { VocabEntry, ReviewGrade } from "@/shared/types";
import { gradeCard } from "../domain/srs";
import { formatInterval } from "@/shared/ui/format";
import { MeaningView } from "@/shared/ui/MeaningView";
import { Definitions } from "@/features/dictionary/ui/Definitions";
import { TermResult } from "@/features/dictionary/data/search";

interface Props {
  queue: VocabEntry[];
  onGrade: (entry: VocabEntry, grade: ReviewGrade) => Promise<VocabEntry>;
  onClose: () => void;
  /** Tải định nghĩa từ điển cho một entry (dùng trong mặt sau thẻ ôn). Tìm dưới
   *  cặp ngôn ngữ của chính entry, không mở DetailPanel, không tính là lookup. */
  onLookupDetails?: (entry: VocabEntry) => Promise<TermResult[]>;
}

const GRADES: { grade: ReviewGrade; label: string; cls: string }[] = [
  { grade: "again", label: "Again", cls: "again" },
  { grade: "hard", label: "Hard", cls: "hard" },
  { grade: "good", label: "Good", cls: "good" },
  { grade: "easy", label: "Easy", cls: "easy" },
];

export function ReviewSession({ queue, onGrade, onClose, onLookupDetails }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);

  // Định nghĩa từ điển cho thẻ đang xem (lazy, cache theo từ). Reset khi đổi thẻ.
  const [dictResults, setDictResults] = useState<TermResult[] | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  // Request id: tăng khi đổi thẻ → mọi request đang chạy cho thẻ cũ bị coi là stale.
  const detailReqRef = useRef(0);

  const card = queue[index];

  // Đổi thẻ (grade sang thẻ kế) → xoá cache định nghĩa và huỷ request cũ.
  useEffect(() => {
    detailReqRef.current++;
    setDictResults(null);
    setDictLoading(false);
    setDictError(null);
  }, [card?.term]);

  const previews = useMemo(() => {
    if (!card) return {} as Record<ReviewGrade, string>;
    const now = Date.now();
    const out = {} as Record<ReviewGrade, string>;
    for (const { grade } of GRADES) {
      out[grade] = formatInterval(gradeCard(card, grade, now).srs_interval);
    }
    return out;
  }, [card]);

  if (!card) {
    return (
      <div className="review-overlay" role="dialog" aria-modal="true">
        <div className="review-card done">
          <h2>Hoàn thành! 🎉</h2>
          <p>Bạn đã ôn {done} thẻ.</p>
          <button className="primary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    );
  }

  async function grade(g: ReviewGrade) {
    await onGrade(card, g);
    setDone((d) => d + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  // Lazy: tải định nghĩa từ điển khi bấm nút. Dùng request-id để bỏ qua kết quả
  // stale nếu người dùng đã grade sang thẻ khác trước khi tải xong.
  async function showDictDetails() {
    if (!onLookupDetails || dictLoading || dictResults !== null) return;
    const req = ++detailReqRef.current;
    setDictLoading(true);
    setDictError(null);
    try {
      const results = await onLookupDetails(card);
      if (req !== detailReqRef.current) return; // đã đổi thẻ
      setDictResults(results);
    } catch (err) {
      if (req !== detailReqRef.current) return;
      setDictError((err as Error).message || "Lỗi tải định nghĩa");
    } finally {
      if (req === detailReqRef.current) setDictLoading(false);
    }
  }

  return (
    <div className="review-overlay" role="dialog" aria-modal="true">
      <div className="review-card">
        <div className="review-progress">
          {index + 1} / {queue.length}
          {card.status === "RELAPSED" && <span className="badge inline">! tái quên</span>}
        </div>

        <div className="flashcard" onClick={() => setFlipped(true)}>
          <div className="front">{card.term}</div>
          {flipped && (
            <div className="back">
              <MeaningView
                term={card.term}
                reading={card.reading}
                pos={card.pos}
                meaning={card.meaning}
                example={card.example}
                analysis={card.sentence_analysis}
              />

              {/* Định nghĩa từ các từ điển — lazy, chỉ tải khi bấm. Không truyền
                  onLookup để link nội bộ trong nghĩa render thành chữ thường,
                  không rời phiên ôn. */}
              {onLookupDetails && dictResults === null && !dictLoading && (
                <button type="button" className="link review-dict-toggle" onClick={showDictDetails}>
                  📖 Xem định nghĩa từ điển
                </button>
              )}
              {dictLoading && <p className="muted review-dict-status">Đang tải định nghĩa…</p>}
              {dictError && <p className="muted review-dict-status">{dictError}</p>}
              {dictResults !== null && (
                <div className="review-dict">
                  <p className="review-dict-label">Trong từ điển</p>
                  {dictResults.length === 0 ? (
                    <p className="muted">Không tìm thấy trong từ điển.</p>
                  ) : (
                    dictResults.map((res, i) => (
                      <div className="result" key={i}>
                        {dictResults.length > 1 && res.entry.dictionary && (
                          <span className="dict-name">{res.entry.dictionary}</span>
                        )}
                        <Definitions
                          senses={res.entry.senses}
                          definitions={res.entry.definitions}
                          tagMeta={res.entry.tagMeta}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {!flipped && <p className="hint">Nhấn để lật đáp án</p>}
        </div>

        {flipped ? (
          <div className="grade-buttons">
            {GRADES.map(({ grade: g, label, cls }) => (
              <button key={g} className={`grade ${cls}`} onClick={() => grade(g)}>
                <span className="grade-label">{label}</span>
                <span className="grade-interval">{previews[g]}</span>
              </button>
            ))}
          </div>
        ) : (
          <button className="primary flip" onClick={() => setFlipped(true)}>Lật thẻ</button>
        )}

        <button className="link close" onClick={onClose}>Kết thúc phiên</button>
      </div>
    </div>
  );
}

