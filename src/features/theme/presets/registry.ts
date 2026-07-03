// Đăng ký hiệu ứng nền theo effect key. Mỗi hiệu ứng là một chunk lazy riêng
// (component + CSS + ảnh trong presets/<effect>/) — theme không được chọn thì
// trình duyệt không tải asset của nó, bundle mặc định không phình.

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { BackgroundEffect, BackgroundSpeed } from "../domain/theme";

/** Props mọi hiệu ứng nền nhận từ `PresetBackground` của preset. */
export interface BackgroundProps {
  opacity: number;
  speed: BackgroundSpeed;
}

export const BACKGROUNDS: Record<BackgroundEffect, LazyExoticComponent<ComponentType<BackgroundProps>>> = {
  buu: lazy(() => import("./buu/BuuBackground")),
  cell: lazy(() => import("./cell/CellBackground")),
  bamboo: lazy(() => import("./panda/PandaBackground")),
  akatsuki: lazy(() => import("./akatsuki/AkatsukiBackground")),
};

/**
 * Thời lượng một vòng trôi của hoạ tiết, cấp cho CSS qua biến `--fx-drift`.
 * "none" vẫn cần giá trị hợp lệ — animation đã bị tắt bằng [data-speed="none"].
 */
export const DRIFT_DURATION: Record<BackgroundSpeed, string> = {
  none: "0s",
  slow: "90s",
  medium: "45s",
};
