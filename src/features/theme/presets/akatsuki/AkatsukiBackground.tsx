// Nền "Akatsuki": mây đỏ viền sáng (motif áo choàng Akatsuki) trôi ngang chậm
// trên nền đen, thỉnh thoảng một bóng quạ lướt qua. Chưa có ảnh thật — mây và
// quạ vẽ bằng SVG làm placeholder; muốn dùng ảnh, thả file vào thư mục này và
// thay thẻ tương ứng (xem buu/ hoặc cell/ làm mẫu).

import type { CSSProperties } from "react";
import { DRIFT_DURATION, type BackgroundProps } from "../registry";
import "./akatsuki.css";

/** Mây đỏ nhiều thuỳ, viền sáng kiểu Akatsuki. */
function Cloud() {
  return (
    <svg viewBox="0 0 120 76" aria-hidden>
      <path
        d="M30 66 C14 66 6 56 10 46 C2 42 4 28 16 26 C18 12 36 8 46 16
           C52 4 74 4 80 16 C94 10 108 20 104 32 C116 38 112 54 98 56
           C96 66 84 70 74 64 C66 74 48 74 42 64 C38 68 34 66 30 66 Z"
        fill="#b91c1c"
        stroke="#e5e7eb"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Bóng quạ — silhouette đơn giản, chỉ hiện thoáng qua. */
function Crow() {
  return (
    <svg viewBox="0 0 64 28" aria-hidden>
      <path
        d="M2 20 Q16 4 30 11 Q35 4 46 2 Q40 10 34 14 Q48 13 62 22
           Q44 22 31 19 Q17 27 2 20 Z"
        fill="#3f2028"
      />
    </svg>
  );
}

export default function AkatsukiBackground({ opacity, speed }: BackgroundProps) {
  const style = { opacity, "--fx-drift": DRIFT_DURATION[speed] } as CSSProperties;
  return (
    <div className="fx-layer fx-akatsuki" data-speed={speed} style={style}>
      <div className="fx-akatsuki-cloud c1"><Cloud /></div>
      <div className="fx-akatsuki-cloud c2"><Cloud /></div>
      <div className="fx-akatsuki-cloud c3"><Cloud /></div>
      <div className="fx-akatsuki-crow"><Crow /></div>
    </div>
  );
}
