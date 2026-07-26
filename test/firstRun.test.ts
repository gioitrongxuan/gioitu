import { describe, it, expect } from "vitest";
import { decideOnboarding } from "@/app/firstRun";

describe("decideOnboarding (#152)", () => {
  it("người mới thật sự (chưa xem, không dữ liệu, không từ điển) → show", () => {
    expect(decideOnboarding(false, false, false)).toBe("show");
  });

  it("đã xem → none, bất kể trên máy có gì", () => {
    expect(decideOnboarding(true, false, false)).toBe("none");
    expect(decideOnboarding(true, true, true)).toBe("none");
  });

  it("chưa xem nhưng đã có dữ liệu học hoặc từ điển local → adopt (người dùng cũ, không làm phiền)", () => {
    expect(decideOnboarding(false, true, false)).toBe("adopt");
    expect(decideOnboarding(false, false, true)).toBe("adopt");
    expect(decideOnboarding(false, true, true)).toBe("adopt");
  });
});
