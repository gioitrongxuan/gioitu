// Nền "Rừng trúc & gấu trúc": thân trúc silhouette dọc hai mép màn hình đung
// đưa rất nhẹ + vài dấu chân gấu trúc mờ góc dưới. Chưa có ảnh thật — toàn bộ
// hoạ tiết vẽ bằng SVG làm placeholder; muốn dùng ảnh, thả file vào thư mục
// này và thay thẻ tương ứng (xem buu/ hoặc cell/ làm mẫu).

import type { CSSProperties } from "react";
import { DRIFT_DURATION, type BackgroundProps } from "../registry";
import "./panda.css";

/** Một cụm 3 thân trúc: đốt là rect bo tròn xếp dọc có khe, kèm lá. */
function BambooCluster() {
  const stalk = (x: number, w: number) =>
    Array.from({ length: 9 }, (_, i) => (
      <rect key={`${x}:${i}`} x={x} y={i * 96} width={w} height={88} rx={w / 2} />
    ));
  return (
    <svg viewBox="0 0 120 860" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <g className="fx-bamboo-stalks">
        {stalk(10, 16)}
        {stalk(52, 22)}
        {stalk(96, 13)}
      </g>
      <g className="fx-bamboo-leaves">
        <path d="M26 180 q 26 -14 52 -4 q -24 18 -52 4 z" />
        <path d="M74 372 q 28 -10 50 6 q -28 12 -50 -6 z" />
        <path d="M20 560 q 24 -16 50 -6 q -22 20 -50 6 z" />
      </g>
    </svg>
  );
}

/** Dấu chân gấu trúc: 1 đệm lớn + 4 ngón. */
function Paw() {
  return (
    <svg viewBox="0 0 84 64" aria-hidden>
      <g>
        <ellipse cx="42" cy="46" rx="20" ry="15" />
        <circle cx="16" cy="26" r="8" />
        <circle cx="33" cy="15" r="8" />
        <circle cx="51" cy="15" r="8" />
        <circle cx="68" cy="26" r="8" />
      </g>
    </svg>
  );
}

export default function PandaBackground({ opacity, speed }: BackgroundProps) {
  const style = { opacity, "--fx-drift": DRIFT_DURATION[speed] } as CSSProperties;
  return (
    <div className="fx-layer fx-bamboo" data-speed={speed} style={style}>
      <div className="fx-bamboo-side left"><BambooCluster /></div>
      <div className="fx-bamboo-side right"><BambooCluster /></div>
      <div className="fx-bamboo-paw w1"><Paw /></div>
      <div className="fx-bamboo-paw w2"><Paw /></div>
      <div className="fx-bamboo-paw w3"><Paw /></div>
    </div>
  );
}
