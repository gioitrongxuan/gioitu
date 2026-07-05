import { describe, it, expect } from "vitest";
import { newPremiumCode, normalizeCode } from "@server/features/premium/code";

describe("premium code", () => {
  it("định dạng XXXX-XXXX-XXXX từ bảng chữ không nhập nhằng", () => {
    const code = newPremiumCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(code).not.toMatch(/[01OIL]/); // không có ký tự dễ nhầm
  });

  it("sinh mã khác nhau", () => {
    const set = new Set(Array.from({ length: 200 }, () => newPremiumCode()));
    expect(set.size).toBe(200);
  });

  it("normalizeCode: bỏ khoảng trắng + viết hoa; rỗng cho input trống", () => {
    expect(normalizeCode("  abcd-efgh-jkmn ")).toBe("ABCD-EFGH-JKMN");
    expect(normalizeCode(null)).toBe("");
    expect(normalizeCode(undefined)).toBe("");
  });
});
