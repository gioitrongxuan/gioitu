import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createSyncScheduler } from "@/features/review/domain/syncScheduler";

describe("createSyncScheduler (đồng bộ theo sự kiện)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("chạy một lần sau khi hết nhịp debounce", () => {
    const run = vi.fn();
    const s = createSyncScheduler(run, 1000);
    s.schedule();
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("gộp một tràng schedule liên tiếp thành một lần chạy", () => {
    const run = vi.fn();
    const s = createSyncScheduler(run, 1000);
    s.schedule();
    vi.advanceTimersByTime(500);
    s.schedule(); // reset đồng hồ
    vi.advanceTimersByTime(500);
    s.schedule(); // reset lần nữa
    vi.advanceTimersByTime(999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("flush chạy ngay lịch đang chờ và không chạy lại khi hết nhịp", () => {
    const run = vi.fn();
    const s = createSyncScheduler(run, 1000);
    s.schedule();
    s.flush();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(1); // không double-run
  });

  it("flush là no-op khi không có gì đang chờ", () => {
    const run = vi.fn();
    const s = createSyncScheduler(run, 1000);
    s.flush();
    expect(run).not.toHaveBeenCalled();
  });

  it("cancel bỏ lịch chờ, không bao giờ chạy", () => {
    const run = vi.fn();
    const s = createSyncScheduler(run, 1000);
    s.schedule();
    s.cancel();
    vi.advanceTimersByTime(2000);
    expect(run).not.toHaveBeenCalled();
  });

  it("dùng lại được sau khi đã chạy", () => {
    const run = vi.fn();
    const s = createSyncScheduler(run, 1000);
    s.schedule();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
    s.schedule();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
