// Nền "Cell": gradient xanh lục độc → tím đen, lưới lục giác (vân sinh học)
// trôi chéo rất chậm, hình Cell mờ góc dưới trái. Pattern là SVG thuần —
// không canvas/JS; vòng lặp trôi dịch đúng một chu kỳ pattern nên không thấy
// điểm nối.

import type { CSSProperties } from "react";
import { DRIFT_DURATION, type BackgroundProps } from "../registry";
import cellImage from "./cell.png";
import "./cell.css";

// Lục giác pointy-top cạnh r=18: rộng 31px, hai hàng lệch nhau lặp mỗi 54px.
// Các hex ở mép tile được vẽ lặp để pattern liền mạch.
const HEX_TILE = (
  <pattern id="fx-hex" width="31" height="54" patternUnits="userSpaceOnUse">
    <g fill="none" stroke="#4ade80" strokeWidth="1">
      <path d="M15.5 0 L31 9 L31 27 L15.5 36 L0 27 L0 9 Z" />
      <path d="M0 27 L15.5 36 L15.5 54 L0 63 L-15.5 54 L-15.5 36 Z" />
      <path d="M31 27 L46.5 36 L46.5 54 L31 63 L15.5 54 L15.5 36 Z" />
      <path d="M0 -27 L15.5 -18 L15.5 0 L0 9 L-15.5 0 L-15.5 -18 Z" />
      <path d="M31 -27 L46.5 -18 L46.5 0 L31 9 L15.5 0 L15.5 -18 Z" />
    </g>
  </pattern>
);

export default function CellBackground({ opacity, speed }: BackgroundProps) {
  const style = { opacity, "--fx-drift": DRIFT_DURATION[speed] } as CSSProperties;
  return (
    <div className="fx-layer fx-cell" data-speed={speed} style={style}>
      <svg className="fx-cell-hex" aria-hidden>
        <defs>{HEX_TILE}</defs>
        <rect width="100%" height="100%" fill="url(#fx-hex)" />
      </svg>
      <img className="fx-cell-figure" src={cellImage} alt="" />
    </div>
  );
}
