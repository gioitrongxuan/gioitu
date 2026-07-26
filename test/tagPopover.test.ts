// Logic thuần của popover mini trên thẻ Word Cloud (#159): nhận diện huỷ
// long-press khi con trỏ xê dịch, và vị trí neo popover quanh thẻ.

import { describe, it, expect } from "vitest";
import {
  isPressMoveCancelling,
  popoverPlacement,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  POPOVER_WIDTH_PX,
} from "@/features/review/domain/tagPopover";

describe("isPressMoveCancelling (huỷ long-press khi cuộn/kéo)", () => {
  const start = { x: 100, y: 100 };

  it("đứng yên hoặc rung nhẹ trong ngưỡng thì không huỷ", () => {
    expect(isPressMoveCancelling(start, start)).toBe(false);
    expect(isPressMoveCancelling(start, { x: 104, y: 103 })).toBe(false);
    // Đúng biên ngưỡng vẫn chưa huỷ (so sánh > chứ không >=).
    expect(isPressMoveCancelling(start, { x: 100 + LONG_PRESS_MOVE_TOLERANCE_PX, y: 100 })).toBe(false);
  });

  it("trượt quá ngưỡng theo bất kỳ hướng nào thì huỷ", () => {
    expect(isPressMoveCancelling(start, { x: 100, y: 100 + LONG_PRESS_MOVE_TOLERANCE_PX + 1 })).toBe(true);
    expect(isPressMoveCancelling(start, { x: 88, y: 100 })).toBe(true);
    // Chéo: mỗi trục dưới ngưỡng nhưng khoảng cách Euclid vượt.
    expect(isPressMoveCancelling(start, { x: 108, y: 108 })).toBe(true);
  });

  it("tôn trọng ngưỡng tuỳ biến", () => {
    expect(isPressMoveCancelling(start, { x: 103, y: 100 }, 2)).toBe(true);
    expect(isPressMoveCancelling(start, { x: 103, y: 100 }, 5)).toBe(false);
  });
});

describe("popoverPlacement (neo popover quanh thẻ)", () => {
  const viewport = { width: 1000, height: 800 };

  it("mặc định nằm dưới thẻ, canh giữa theo chiều ngang", () => {
    const anchor = { top: 100, bottom: 138, left: 400, width: 80 };
    const pos = popoverPlacement(anchor, viewport);
    expect(pos.placement).toBe("below");
    expect(pos.top).toBeGreaterThan(anchor.bottom); // có khe hở với thẻ
    expect(pos.bottom).toBeUndefined();
    // Canh giữa: tâm popover trùng tâm thẻ.
    expect(pos.left + POPOVER_WIDTH_PX / 2).toBe(anchor.left + anchor.width / 2);
  });

  it("thẻ gần đáy màn hình thì lật lên trên, neo theo bottom", () => {
    const anchor = { top: 740, bottom: 778, left: 400, width: 80 };
    const pos = popoverPlacement(anchor, viewport);
    expect(pos.placement).toBe("above");
    expect(pos.top).toBeUndefined();
    // Đáy popover nằm trên đỉnh thẻ (tính từ đáy viewport).
    expect(pos.bottom).toBeGreaterThan(viewport.height - anchor.top);
  });

  it("kẹp trong lề màn hình ở cả hai mép", () => {
    const nearLeft = popoverPlacement({ top: 100, bottom: 138, left: 4, width: 40 }, viewport);
    expect(nearLeft.left).toBeGreaterThan(0);

    const nearRight = popoverPlacement({ top: 100, bottom: 138, left: 960, width: 40 }, viewport);
    expect(nearRight.left + POPOVER_WIDTH_PX).toBeLessThan(viewport.width);
  });

  it("viewport hẹp hơn popover: lề trái thắng (CSS max-width lo phần tràn)", () => {
    const narrow = { width: 200, height: 800 };
    const pos = popoverPlacement({ top: 100, bottom: 138, left: 50, width: 40 }, narrow);
    expect(pos.left).toBeGreaterThan(0);
    expect(pos.left).toBeLessThan(narrow.width);
  });
});
