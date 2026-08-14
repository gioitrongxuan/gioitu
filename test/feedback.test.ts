import { describe, expect, it } from "vitest";
import {
  FEEDBACK_KINDS,
  FEEDBACK_MAX,
  checkFeedback,
  kindLabel,
} from "@/features/feedback/domain/feedback";

describe("checkFeedback", () => {
  it("nhận bản nháp hợp lệ và trả nội dung đã trim", () => {
    const check = checkFeedback({ kind: "idea", message: "  Muốn lọc theo tag\n" });
    expect(check).toEqual({ ok: true, value: { kind: "idea", message: "Muốn lọc theo tag" } });
  });

  it("từ chối nội dung rỗng, kể cả khi chỉ toàn khoảng trắng", () => {
    for (const message of ["", "   ", "\n\t "]) {
      expect(checkFeedback({ kind: "bug", message })).toEqual({
        ok: false,
        error: "Hãy nhập nội dung góp ý",
      });
    }
  });

  it("đo độ dài SAU khi trim — khoảng trắng thừa không làm góp ý bị coi là quá dài", () => {
    const message = `  ${"a".repeat(FEEDBACK_MAX)}  `;
    expect(checkFeedback({ kind: "other", message }).ok).toBe(true);
  });

  it("từ chối khi vượt trần độ dài", () => {
    const check = checkFeedback({ kind: "other", message: "a".repeat(FEEDBACK_MAX + 1) });
    expect(check).toEqual({ ok: false, error: `Góp ý quá dài (tối đa ${FEEDBACK_MAX} ký tự)` });
  });

  it("từ chối loại góp ý lạ", () => {
    expect(checkFeedback({ kind: "spam", message: "xin chào" })).toEqual({
      ok: false,
      error: "Loại góp ý không hợp lệ",
    });
  });

  it("nhận đủ ba loại đang khai báo", () => {
    for (const { kind } of FEEDBACK_KINDS) {
      expect(checkFeedback({ kind, message: "nội dung" }).ok).toBe(true);
    }
  });
});

describe("kindLabel", () => {
  it("dịch mã loại thành nhãn tiếng Việt", () => {
    expect(kindLabel("bug")).toBe("Báo lỗi");
    expect(kindLabel("other")).toBe("Khác");
  });

  it("loại lạ giữ nguyên mã — màn admin đọc đúng thứ đã lưu, không gộp bừa", () => {
    expect(kindLabel("rating")).toBe("rating");
  });
});
