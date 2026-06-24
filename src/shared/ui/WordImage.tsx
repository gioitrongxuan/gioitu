// A word's illustrative image, shared by the detail panel and the review
// flashcard. Shows the highest-voted candidate; a "Xem thêm" button opens a
// vote screen where the user picks the images that fit (the top-voted one then
// displays here). Degrades silently: a broken image hides itself, and with no
// candidate at all the component renders nothing.

import { useEffect, useState } from "react";
import { VocabEntry } from "@/shared/types";
import { displayImage, votedCount, MAX_VOTED_IMAGES } from "@/shared/wordImage";

interface Props {
  entry: VocabEntry;
  /** Up-vote a candidate (repeat to outrank others). */
  onVote: (url: string) => void;
  /** Clear a candidate's votes. */
  onClear: (url: string) => void;
}

export function WordImage({ entry, onVote, onClear }: Props) {
  const [voting, setVoting] = useState(false);
  const [failed, setFailed] = useState(false);

  const display = displayImage(entry);
  const candidates = entry.image_candidates ?? [];
  // Clear a stale load error when the displayed image changes (e.g. after a vote).
  useEffect(() => setFailed(false), [display?.url]);

  if (!display) return null;

  return (
    <figure className="word-image">
      {!failed && (
        <img src={display.url} alt={entry.term} loading="lazy" onError={() => setFailed(true)} />
      )}
      <figcaption className="word-image-credit">
        <span>{failed ? "Ảnh lỗi" : display.source}</span>
        {candidates.length > 1 && (
          <button className="link" onClick={() => setVoting(true)}>
            Xem thêm ({candidates.length})
          </button>
        )}
      </figcaption>

      {voting && (
        <ImageVotePanel
          entry={entry}
          onVote={onVote}
          onClear={onClear}
          onClose={() => setVoting(false)}
        />
      )}
    </figure>
  );
}

function ImageVotePanel({ entry, onVote, onClear, onClose }: Props & { onClose: () => void }) {
  const candidates = entry.image_candidates ?? [];
  const voted = votedCount(candidates);
  const best = displayImage(entry);

  return (
    <div className="image-vote-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="image-vote" onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>Chọn ảnh cho “{entry.term}”</h3>
          <button className="link close" onClick={onClose}>✕</button>
        </header>
        <p className="muted">
          Nhấn ▲ để bình chọn ảnh phù hợp (tối đa {MAX_VOTED_IMAGES}; nhấn nhiều lần để
          đẩy hạng). Ảnh điểm cao nhất sẽ hiển thị.
        </p>
        <div className="image-vote-grid">
          {candidates.map((c) => {
            const isWinner = best?.url === c.url;
            const atCap = c.votes === 0 && voted >= MAX_VOTED_IMAGES;
            return (
              <div key={c.url} className={`vote-cell${isWinner ? " winner" : ""}`}>
                <img src={c.url} alt="" loading="lazy" />
                <div className="vote-controls">
                  <button
                    className="link vote-up"
                    disabled={atCap}
                    title={atCap ? `Đã chọn tối đa ${MAX_VOTED_IMAGES} ảnh` : "Bình chọn"}
                    onClick={() => onVote(c.url)}
                  >
                    ▲{c.votes > 0 ? ` ${c.votes}` : ""}
                  </button>
                  {c.votes > 0 && (
                    <button className="link vote-clear" title="Bỏ chọn" onClick={() => onClear(c.url)}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
