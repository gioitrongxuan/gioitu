import { describe, it, expect } from "vitest";
import { parsePitch } from "@/features/dictionary/domain/pitch";

describe("parsePitch", () => {
  it("căn L/H theo mora, đánh dấu xuống giọng, đọc ô trợ từ", () => {
    const p = parsePitch("LHHHHLL-L", ["き", "ん", "きゅ", "う", "ひ", "な", "ん"])!;
    expect(p.moras.map((m) => m.high)).toEqual([false, true, true, true, true, false, false]);
    // pattern dồn = LHHHHLLL → xuống giọng sau "ひ" (mora index 4, cao, kế tiếp thấp).
    expect(p.moras[4].dropsAfter).toBe(true);
    expect(p.moras[1].dropsAfter).toBe(false);
    expect(p.particleHigh).toBe(false); // ô dư thứ 8 = L
  });

  it("null khi thiếu mora hoặc accent", () => {
    expect(parsePitch("LHL", [])).toBeNull();
    expect(parsePitch("", ["か"])).toBeNull();
    expect(parsePitch(undefined, ["か"])).toBeNull();
  });

  it("không có ô trợ từ → particleHigh null", () => {
    const p = parsePitch("LH", ["か", "さ"])!;
    expect(p.particleHigh).toBeNull();
    expect(p.moras[1].high).toBe(true);
  });
});
