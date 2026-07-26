import { describe, it, expect, beforeEach } from "vitest";
import {
  THEME_SKINS,
  skinById,
  updateEarnedSkins,
  loadEarnedSkins,
  saveEarnedSkins,
} from "@/features/theme/domain/skins";
import { DEFAULT_THEME, DARK_THEME, heatTextColor, isHexColor, type Theme } from "@/features/theme/domain/theme";

describe("THEME_SKINS", () => {
  it("ships the four character skins, mốc mở khoá tăng dần", () => {
    expect(THEME_SKINS.map((s) => s.id)).toEqual(["panda", "buu", "cell", "akatsuki"]);
    const marks = THEME_SKINS.map((s) => s.requiredStreak);
    expect(marks).toEqual([...marks].sort((a, b) => a - b));
    expect(new Set(marks).size).toBe(marks.length);
    for (const mark of marks) expect(mark).toBeGreaterThan(0);
  });

  it("mỗi skin chỉ mang hai đầu heatmap hợp lệ — không đụng token chữ/nền (DESIGN §1)", () => {
    for (const skin of THEME_SKINS) {
      expect(Object.keys(skin.heat).sort(), skin.id).toEqual(["heatFrom", "heatTo"]);
      expect(isHexColor(skin.heat.heatFrom), skin.id).toBe(true);
      expect(isHexColor(skin.heat.heatTo), skin.id).toBe(true);
    }
  });

  it("keeps the background subtle: opacity in (0, 0.5]", () => {
    for (const skin of THEME_SKINS) {
      expect(skin.background.opacity, skin.id).toBeGreaterThan(0);
      expect(skin.background.opacity, skin.id).toBeLessThanOrEqual(0.5);
    }
  });

  it("no skin themes the relapse badge — it stays a warning signal (DESIGN §1)", () => {
    for (const skin of THEME_SKINS) {
      // Skin trang trí không được thay glyph cảnh báo tái quên bằng emoji dễ
      // thương: badge luôn là "!" trắng trên nền --warn ở WordCloud.
      expect(Object.keys(skin.icons), skin.id).toEqual(["emblem"]);
      expect(skin.icons.emblem.length, skin.id).toBeGreaterThan(0);
    }
  });

  // Skin ngồi trên bất kỳ nền nào người dùng đang dùng, nên cặp heat phải giữ
  // AA cho chữ trên tag ở mọi shade — heatTextColor chỉ phụ thuộc hai đầu heat,
  // kiểm trên cả hai base sáng/tối cho tường minh.
  it("mọi shade của mọi skin giữ chữ tag ≥ 4.5:1 (AA) trên cả nền sáng lẫn tối", () => {
    const luminance = (hex: string): number => {
      const n = parseInt(hex.replace("#", ""), 16);
      const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
    };
    const contrast = (fg: string, bg: string): number => {
      const [l1, l2] = [luminance(fg), luminance(bg)];
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };
    const heatBgHex = (shade: number, theme: Theme): string => {
      const parse = (hex: string) => {
        const n = parseInt(hex.replace("#", ""), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
      };
      const [a, b] = [parse(theme.heatFrom), parse(theme.heatTo)];
      const to2 = (v: number) => Math.round(v).toString(16).padStart(2, "0");
      return `#${[0, 1, 2].map((i) => to2(a[i] + (b[i] - a[i]) * shade)).join("")}`;
    };

    for (const skin of THEME_SKINS) {
      for (const base of [DEFAULT_THEME, DARK_THEME]) {
        const theme: Theme = { ...base, ...skin.heat };
        for (let i = 0; i <= 100; i++) {
          const shade = i / 100;
          const fg = heatTextColor(shade, theme);
          const bg = heatBgHex(shade, theme);
          expect(contrast(fg, bg), `${skin.id} @ shade ${shade}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

describe("skinById", () => {
  it("finds a skin and returns undefined for null/unknown", () => {
    expect(skinById("akatsuki")?.name).toBe("Akatsuki");
    expect(skinById(null)).toBeUndefined();
    // decor.presetId cũ có thể còn trỏ tới preset màu — không phải skin.
    expect(skinById("ember")).toBeUndefined();
  });
});

describe("updateEarnedSkins", () => {
  it("chưa ôn ngày nào: chưa mở skin nào", () => {
    expect(updateEarnedSkins([], 0, null)).toEqual([]);
  });

  it("chuỗi chạm mốc nào mở mốc đó (theo chuỗi dài nhất)", () => {
    expect(updateEarnedSkins([], 3, null)).toEqual(["panda"]);
    expect(updateEarnedSkins([], 7, null)).toEqual(["panda", "buu"]);
    expect(updateEarnedSkins([], 29, null)).toEqual(["panda", "buu", "cell"]);
    expect(updateEarnedSkins([], 30, null)).toEqual(["panda", "buu", "cell", "akatsuki"]);
  });

  it("skin đã mở giữ vĩnh viễn dù chuỗi hiện tại đã đứt", () => {
    expect(updateEarnedSkins(["panda", "buu"], 0, null)).toEqual(["panda", "buu"]);
  });

  it("skin đang mặc từ trước ngày có gating được giữ luôn (grandfather)", () => {
    expect(updateEarnedSkins([], 0, "akatsuki")).toEqual(["akatsuki"]);
  });

  it("không nhân đôi và trả về theo thứ tự bộ sưu tập", () => {
    expect(updateEarnedSkins(["buu", "panda"], 3, "buu")).toEqual(["panda", "buu"]);
  });

  it("id lạ trong danh sách lưu trữ bị loại; presetId của preset màu không mở gì", () => {
    expect(updateEarnedSkins(["no-such-skin"], 0, "ember")).toEqual([]);
  });
});

describe("loadEarnedSkins / saveEarnedSkins", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });

  it("round-trips danh sách đã mở", () => {
    saveEarnedSkins(["panda", "buu"]);
    expect(loadEarnedSkins()).toEqual(["panda", "buu"]);
  });

  it("chưa lưu gì: danh sách rỗng", () => {
    expect(loadEarnedSkins()).toEqual([]);
  });

  it("dữ liệu hỏng hoặc sai kiểu: bỏ phần hỏng, không ném lỗi", () => {
    localStorage.setItem("gioitu.skins.v1", JSON.stringify({ not: "an array" }));
    expect(loadEarnedSkins()).toEqual([]);

    localStorage.setItem("gioitu.skins.v1", JSON.stringify(["panda", 42, null]));
    expect(loadEarnedSkins()).toEqual(["panda"]);

    localStorage.setItem("gioitu.skins.v1", "{not valid json");
    expect(loadEarnedSkins()).toEqual([]);
  });
});
