// Logic thuần cho popover mini trên thẻ Word Cloud (#159): nhận diện long-press
// (thay "Chế độ xoá" toàn cục) và tính vị trí neo popover quanh thẻ. Không phụ
// thuộc React/DOM — UI cấp toạ độ/kích thước, ở đây chỉ quyết định.

/** Giữ tay đủ lâu (ms) thì tính là long-press — mốc quen thuộc của mobile OS. */
export const LONG_PRESS_MS = 500;

/** Con trỏ xê dịch quá ngưỡng này (px) coi như đang cuộn/kéo → huỷ long-press. */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

/** Chuột đậu trên thẻ bao lâu (ms) thì mở popover — nhanh hơn tooltip gốc. */
export const HOVER_OPEN_DELAY_MS = 350;

/** Đóng trễ (ms) khi chuột rời thẻ — đủ để kịp rê vào trong popover. */
export const HOVER_CLOSE_DELAY_MS = 200;

export interface PressPoint {
  x: number;
  y: number;
}

/**
 * Con trỏ đã xê dịch đủ xa để coi là cuộn/kéo (huỷ long-press) chưa. So bình
 * phương khoảng cách Euclid để khỏi khai căn.
 */
export function isPressMoveCancelling(
  start: PressPoint,
  current: PressPoint,
  tolerancePx: number = LONG_PRESS_MOVE_TOLERANCE_PX,
): boolean {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  return dx * dx + dy * dy > tolerancePx * tolerancePx;
}

/** Khung của thẻ neo (tập con DOMRect — nhận thẳng getBoundingClientRect()). */
export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Bề rộng danh nghĩa của popover; CSS còn kẹp max-width theo viewport hẹp. */
export const POPOVER_WIDTH_PX = 260;
/** Khe hở giữa thẻ và popover. */
const POPOVER_GAP_PX = 6;
/** Không cho popover dán sát mép màn hình. */
const VIEWPORT_MARGIN_PX = 8;
/**
 * Ước lượng chiều cao tối đa để quyết định lật lên trên khi thẻ nằm gần đáy.
 * Khi lật, popover neo theo `bottom` nên sai số ước lượng không làm nó tràn màn.
 */
const POPOVER_EST_HEIGHT_PX = 190;

export interface PopoverPlacement {
  left: number;
  /** Toạ độ viewport khi đặt DƯỚI thẻ (position: fixed). */
  top?: number;
  /** Khoảng cách từ đáy viewport khi lật LÊN TRÊN thẻ. */
  bottom?: number;
  placement: "below" | "above";
}

/**
 * Vị trí popover quanh thẻ neo: canh giữa theo chiều ngang (kẹp trong lề màn
 * hình), ưu tiên nằm dưới thẻ; gần đáy thì lật lên trên. Khi lật, neo theo
 * `bottom` để không cần biết trước chiều cao thật của popover.
 */
export function popoverPlacement(anchor: AnchorRect, viewport: Viewport): PopoverPlacement {
  const centered = anchor.left + anchor.width / 2 - POPOVER_WIDTH_PX / 2;
  const rightmost = viewport.width - POPOVER_WIDTH_PX - VIEWPORT_MARGIN_PX;
  // max SAU min: viewport hẹp hơn cả popover thì lề trái thắng (CSS max-width lo phần tràn).
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(centered, rightmost));

  const fitsBelow = anchor.bottom + POPOVER_GAP_PX + POPOVER_EST_HEIGHT_PX <= viewport.height;
  if (fitsBelow) return { left, top: anchor.bottom + POPOVER_GAP_PX, placement: "below" };
  return { left, bottom: viewport.height - anchor.top + POPOVER_GAP_PX, placement: "above" };
}
