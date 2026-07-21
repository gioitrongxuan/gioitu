// Kho toast (shared/ui/Toasts) sống ngoài React — kiểm bằng các API thuần:
// push có/không kèm hành động, tự tắt sau 4s, và nút hành động đóng đúng toast.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { pushToast, dismissToast, getToasts } from "@/shared/ui/Toasts";

describe("Toasts store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Dọn sạch hàng còn sót giữa các test (state ở cấp module).
    for (const t of [...getToasts()]) dismissToast(t.id);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("toast thường không có nút hành động", () => {
    pushToast("xin chào");
    const list = getToasts();
    expect(list).toHaveLength(1);
    expect(list[0].message).toBe("xin chào");
    expect(list[0].action).toBeUndefined();
  });

  it("tự tắt sau 4s", () => {
    pushToast("thoáng qua");
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(getToasts()).toHaveLength(0);
  });

  it("giữ nút hành động khi truyền action", () => {
    const onClick = vi.fn();
    pushToast("đã đánh dấu", "success", { label: "Hoàn tác", onClick });
    const t = getToasts()[0];
    expect(t.action?.label).toBe("Hoàn tác");
    // Chạy hành động rồi tự đóng toast đó (mô phỏng ToastHost gọi onClick + dismiss).
    t.action?.onClick();
    dismissToast(t.id);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(getToasts()).toHaveLength(0);
  });

  it("dismissToast chỉ gỡ đúng toast theo id", () => {
    pushToast("một");
    pushToast("hai");
    const [a] = getToasts();
    dismissToast(a.id);
    const rest = getToasts();
    expect(rest).toHaveLength(1);
    expect(rest[0].message).toBe("hai");
  });
});
