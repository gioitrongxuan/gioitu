// Nền "Majin Buu": wash hồng phấn → tím, hình Buu mờ góc dưới phải nhún nhẹ,
// vài cụm khói hồng (làn hơi từ lỗ thoát khí của Buu) trôi chậm. Chỉ animate
// transform để không gây giật khi cuộn.

import type { CSSProperties } from "react";
import { DRIFT_DURATION, type BackgroundProps } from "../registry";
import buuImage from "./buu.webp";
import "./buu.css";

export default function BuuBackground({ opacity, speed }: BackgroundProps) {
  const style = { opacity, "--fx-drift": DRIFT_DURATION[speed] } as CSSProperties;
  return (
    <div className="fx-layer fx-buu" data-speed={speed} style={style}>
      <img className="fx-buu-figure" src={buuImage} alt="" />
      <span className="fx-buu-puff p1" />
      <span className="fx-buu-puff p2" />
      <span className="fx-buu-puff p3" />
    </div>
  );
}
