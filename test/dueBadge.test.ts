import { describe, it, expect } from "vitest";
import { formatDueTitle } from "@/features/review/domain/dueBadge";

describe("formatDueTitle", () => {
  const base = "Gioitu — Từ điển cá nhân hóa + SRS";

  it("giữ nguyên tiêu đề khi không có từ đến hạn", () => {
    expect(formatDueTitle(0, base)).toBe(base);
  });

  it("chèn số đến hạn vào đầu tiêu đề", () => {
    expect(formatDueTitle(3, base)).toBe(`(3) ${base}`);
  });

  it("số âm (không kỳ vọng) coi như không có gì đến hạn", () => {
    expect(formatDueTitle(-1, base)).toBe(base);
  });
});
