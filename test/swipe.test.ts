import { describe, expect, it } from "vitest";
import {
  evaluateSwipe,
  SWIPE_COMMIT_DISTANCE,
  SWIPE_DEAD_ZONE,
} from "@/features/review/domain/swipe";

describe("evaluateSwipe", () => {
  it("trong vùng chết → null (tap, không phải swipe)", () => {
    expect(evaluateSwipe(0, 0)).toBeNull();
    expect(evaluateSwipe(SWIPE_DEAD_ZONE, 0)).toBeNull();
    expect(evaluateSwipe(-5, 8)).toBeNull();
  });

  it("bốn hướng map đúng grade: trái Quên · phải Nhớ · lên Dễ · xuống Khó", () => {
    expect(evaluateSwipe(-50, 0)).toMatchObject({ direction: "left", grade: "again" });
    expect(evaluateSwipe(50, 0)).toMatchObject({ direction: "right", grade: "good" });
    expect(evaluateSwipe(0, -50)).toMatchObject({ direction: "up", grade: "easy" });
    expect(evaluateSwipe(0, 50)).toMatchObject({ direction: "down", grade: "hard" });
  });

  it("kéo chéo lấy trục thắng thế", () => {
    expect(evaluateSwipe(-60, 20)?.direction).toBe("left");
    expect(evaluateSwipe(20, 60)?.direction).toBe("down");
  });

  it("hoà |dx| = |dy| nghiêng về trục ngang", () => {
    expect(evaluateSwipe(40, 40)?.direction).toBe("right");
    expect(evaluateSwipe(-40, -40)?.direction).toBe("left");
  });

  it("progress tăng theo khoảng kéo và kẹp tại 1", () => {
    const half = evaluateSwipe(SWIPE_COMMIT_DISTANCE / 2, 0);
    expect(half?.progress).toBeCloseTo(0.5);
    expect(half?.committed).toBe(false);
    const far = evaluateSwipe(SWIPE_COMMIT_DISTANCE * 3, 0);
    expect(far?.progress).toBe(1);
  });

  it("chạm ngưỡng chốt → committed", () => {
    expect(evaluateSwipe(SWIPE_COMMIT_DISTANCE, 0)?.committed).toBe(true);
    expect(evaluateSwipe(SWIPE_COMMIT_DISTANCE - 1, 0)?.committed).toBe(false);
    expect(evaluateSwipe(0, -SWIPE_COMMIT_DISTANCE)?.committed).toBe(true);
  });

  it("khoảng kéo đo trên trục thắng thế, không cộng trục kia", () => {
    // 80px ngang + 60px dọc: trục thắng thế mới 80 < 90 → chưa chốt, dù độ dài
    // vector (100) đã vượt ngưỡng.
    expect(evaluateSwipe(80, 60)?.committed).toBe(false);
  });

  it("ngưỡng tuỳ biến qua tham số", () => {
    expect(evaluateSwipe(30, 0, 10, 25)).toMatchObject({ committed: true, progress: 1 });
    expect(evaluateSwipe(30, 0, 40, 100)).toBeNull();
  });
});
