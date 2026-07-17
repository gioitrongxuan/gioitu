import { describe, it, expect } from "vitest";
import { classifyResponse, formatLastSync } from "@/features/review/domain/syncStatus";

describe("classifyResponse", () => {
  it("2xx (res.ok) → ok", () => {
    expect(classifyResponse({ ok: true, status: 200 })).toBe("ok");
    expect(classifyResponse({ ok: true, status: 204 })).toBe("ok");
  });

  it("401 → unauthorized (token hết hạn/không hợp lệ)", () => {
    expect(classifyResponse({ ok: false, status: 401 })).toBe("unauthorized");
  });

  it("mọi mã lỗi khác gộp về offline", () => {
    expect(classifyResponse({ ok: false, status: 500 })).toBe("offline");
    expect(classifyResponse({ ok: false, status: 403 })).toBe("offline");
    expect(classifyResponse({ ok: false, status: 0 })).toBe("offline");
  });
});

describe("formatLastSync", () => {
  it("null (chưa đồng bộ) → chuỗi rỗng để ẩn", () => {
    expect(formatLastSync(null)).toBe("");
  });

  it("hiện hh:mm hai chữ số theo đồng hồ máy", () => {
    // Dựng Date từ thành phần giờ máy để test không phụ thuộc múi giờ khi chạy.
    const morning = new Date(2026, 6, 17, 9, 5).getTime();
    expect(formatLastSync(morning)).toBe("lần cuối 09:05");

    const afternoon = new Date(2026, 6, 17, 14, 30).getTime();
    expect(formatLastSync(afternoon)).toBe("lần cuối 14:30");
  });
});
