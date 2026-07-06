// Flashcard review session (SPEC 4.4): flip card, self-grade with 4 buttons.
// Each button shows the interval it would schedule (computed via the engine).

import { useMemo, useState } from "react";
import { VocabEntry, ReviewGrade } from "@/shared/types";
import { gradeCard } from "../domain/srs";
import { formatInterval } from "@/shared/ui/format";
import { MeaningView } from "@/shared/ui/MeaningView";

interface Props {
  queue: VocabEntry[];
  onGrade: (entry: VocabEntry, grade: ReviewGrade) => Promise<VocabEntry>;
  onClose: () => void;
}

const GRADES: { grade: ReviewGrade; label: string; cls: string }[] = [
  { grade: "again", label: "Again", cls: "again" },
  { grade: "hard", label: "Hard", cls: "hard" },
  { grade: "good", label: "Good", cls: "good" },
  { grade: "easy", label: "Easy", cls: "easy" },
];

export function ReviewSession({ queue, onGrade, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);

  const card = queue[index];

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

