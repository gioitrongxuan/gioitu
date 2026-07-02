import { describe, it, expect } from "vitest";
import { accentDrop, accentPattern, parsePitch, splitMoras } from "@/features/dictionary/domain/pitch";

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

describe("splitMoras", () => {
  it("ghép yōon (kana nhỏ) vào mora trước", () => {
    expect(splitMoras("きょう")).toEqual(["きょ", "う"]);
    expect(splitMoras("べんきょう")).toEqual(["べ", "ん", "きょ", "う"]);
  });
  it("っ, ー, ん là mora riêng", () => {
    expect(splitMoras("がっこう")).toEqual(["が", "っ", "こ", "う"]);
    expect(splitMoras("コーヒー")).toEqual(["コ", "ー", "ヒ", "ー"]);
  });
});

describe("accentPattern + accentDrop (nghịch đảo)", () => {
  it("bằng (heiban, drop 0): thấp mora đầu, cao phần còn lại, trợ từ cao", () => {
    expect(accentPattern(4, 0)).toBe("LHHHH"); // 4 mora + ô trợ từ H
  });
  it("đầu (atamadaka, drop 1): cao mora đầu rồi thấp, trợ từ thấp", () => {
    expect(accentPattern(4, 1)).toBe("HLLLL");
  });
  it("giữa/cuối (drop k): xuống giọng ngay sau mora thứ k", () => {
    expect(accentPattern(4, 2)).toBe("LHLLL");
    expect(accentPattern(2, 2)).toBe("LHL"); // odaka
  });
  it("accentDrop dựng lại đúng vị trí đã sinh", () => {
    const moras = splitMoras("べんきょう"); // 4 mora
    for (const drop of [0, 1, 2, 3, 4]) {
      expect(accentDrop(accentPattern(moras.length, drop), moras)).toBe(drop);
    }
  });
});
