// Sơ đồ thứ tự nét kiểu jisho: mỗi nét một ô vuông — nét đã viết màu mờ, nét
// hiện tại đậm kèm chấm đỏ ở điểm đặt bút, kẻ ô giữa gạch chấm. Dữ liệu tải
// lười từ GitHub (data/kanjivg); offline / không có file → một dòng báo gọn.

import { useEffect, useState } from "react";
import { KanjiStroke, KANJIVG_SIZE } from "../domain/kanjivg";
import { fetchKanjiStrokes } from "../data/kanjivg";

export function KanjiStrokeDiagram({ kanji }: { kanji: string }) {
  // undefined = đang tải, null = không có dữ liệu.
  const [strokes, setStrokes] = useState<KanjiStroke[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fetchKanjiStrokes(kanji).then((s) => alive && setStrokes(s));
    return () => {
      alive = false;
    };
  }, [kanji]);

  if (strokes === undefined) return <p className="muted">Đang tải nét viết…</p>;
  if (strokes === null) return <p className="muted">Không có dữ liệu nét viết cho chữ này.</p>;

  return (
    <div className="kanji-strokes" role="img" aria-label={`Thứ tự ${strokes.length} nét của ${kanji}`}>
      {strokes.map((_, i) => (
        <StrokePanel key={i} strokes={strokes} upTo={i} />
      ))}
    </div>
  );
}

const MID = KANJIVG_SIZE / 2;

/** Ô thứ `upTo`: các nét trước mờ, nét `upTo` đậm + chấm khởi bút. */
function StrokePanel({ strokes, upTo }: { strokes: KanjiStroke[]; upTo: number }) {
  const current = strokes[upTo];
  return (
    <svg viewBox={`0 0 ${KANJIVG_SIZE} ${KANJIVG_SIZE}`} className="stroke-panel">
      <rect x="1" y="1" width={KANJIVG_SIZE - 2} height={KANJIVG_SIZE - 2} rx="6" className="sp-frame" />
      <path d={`M0,${MID} H${KANJIVG_SIZE} M${MID},0 V${KANJIVG_SIZE}`} className="sp-grid" />
      {strokes.slice(0, upTo).map((s, i) => (
        <path key={i} d={s.d} className="sp-done" />
      ))}
      <path d={current.d} className="sp-current" />
      <circle cx={current.startX} cy={current.startY} r="4" className="sp-start" />
      <text x="5" y="5" className="sp-num">{upTo + 1}</text>
    </svg>
  );
}
