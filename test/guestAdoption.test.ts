import { describe, it, expect } from "vitest";
import { guestAdoptionPrompt } from "@/features/auth/domain/guestAdoption";

describe("guestAdoptionPrompt", () => {
  it("không hỏi khi không có dữ liệu khách để gộp", () => {
    expect(guestAdoptionPrompt(0)).toBeNull();
  });

  it("phòng hờ số âm (không bao giờ xảy ra) vẫn coi như không có gì", () => {
    expect(guestAdoptionPrompt(-1)).toBeNull();
  });

  it("hỏi kèm số từ và lời nhắc máy dùng chung khi có dữ liệu khách", () => {
    const msg = guestAdoptionPrompt(3);
    expect(msg).not.toBeNull();
    expect(msg).toContain("3 từ");
    // Nhắc người dùng bấm Huỷ trên máy dùng chung — đúng mục tiêu chống trộn dữ liệu.
    expect(msg).toContain("Huỷ");
    expect(msg).toContain("máy dùng chung");
  });
});
