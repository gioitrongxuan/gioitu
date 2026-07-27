// Swipe 4 hướng trong phiên ôn (BACKLOG GĐ3, #160 — DESIGN §4): sau khi lật,
// kéo thẻ để chấm — trái Quên · phải Nhớ · lên Dễ · xuống Khó. Thuần: từ vector
// kéo (dx, dy, toạ độ màn hình — dy âm là kéo LÊN) quyết định hướng/grade và
// mức tiến tới ngưỡng chốt; UI chỉ vẽ chỉ dấu và gọi grade khi thả tay.

import { ReviewGrade } from "@/shared/types";

export type SwipeDirection = "left" | "right" | "up" | "down";

/** Bản đồ hướng → grade (DESIGN §4). Ngang là cặp dùng nhiều (Quên/Nhớ),
 *  dọc là cặp tinh chỉnh (Dễ/Khó). */
const SWIPE_GRADE: Record<SwipeDirection, ReviewGrade> = {
  left: "again",
  right: "good",
  up: "easy",
  down: "hard",
};

/** Kéo chưa quá ngưỡng này coi như tap (lật/bấm trong thẻ) — chưa hiện chỉ dấu. */
export const SWIPE_DEAD_ZONE = 14;
/** Kéo đạt ngưỡng này rồi thả tay thì chốt grade. */
export const SWIPE_COMMIT_DISTANCE = 90;

export interface SwipeHint {
  direction: SwipeDirection;
  grade: ReviewGrade;
  /** Tỉ lệ so với ngưỡng chốt, kẹp [0..1] — để chỉ dấu đậm dần theo khoảng kéo. */
  progress: number;
  /** Thả tay lúc này thì chấm luôn. */
  committed: boolean;
}

/**
 * Đánh giá một vector kéo. Trong vùng chết → null (cú kéo là tap/rung tay).
 * Hướng lấy theo trục THẮNG THẾ (thành phần lớn hơn) để kéo chéo không nhập
 * nhằng; hoà |dx| = |dy| nghiêng về trục ngang vì Quên/Nhớ dùng nhiều hơn.
 * Khoảng kéo cũng đo trên trục thắng thế — thành phần trục kia chỉ là run tay.
 */
export function evaluateSwipe(
  dx: number,
  dy: number,
  deadZone: number = SWIPE_DEAD_ZONE,
  commitDistance: number = SWIPE_COMMIT_DISTANCE,
): SwipeHint | null {
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (distance <= deadZone) return null;
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);
  const direction: SwipeDirection = isHorizontal
    ? dx < 0 ? "left" : "right"
    : dy < 0 ? "up" : "down";
  return {
    direction,
    grade: SWIPE_GRADE[direction],
    progress: Math.min(1, distance / commitDistance),
    committed: distance >= commitDistance,
  };
}
