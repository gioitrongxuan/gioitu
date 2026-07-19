import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_THEME,
  DARK_THEME,
  DEFAULT_DECOR,
  THEME_PRESETS,
  applyTheme,
  loadTheme,
  saveTheme,
  loadDecor,
  saveDecor,
  presetById,
  isHexColor,
  isDarkColor,
  heatBackground,
  heatTextColor,
  contrastOf,
  type Theme,
  type ThemeDecor,
} from "@/features/theme/domain/theme";

describe("isHexColor", () => {
  it("accepts full #rrggbb", () => {
    expect(isHexColor("#2563eb")).toBe(true);
    expect(isHexColor("#ABCDEF")).toBe(true);
    expect(isHexColor("  #1b1f26  ")).toBe(true);
  });
  it("rejects shorthand, partial and non-hex", () => {
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("2563eb")).toBe(false);
    expect(isHexColor("#2563e")).toBe(false);
    expect(isHexColor("#xyzxyz")).toBe(false);
    expect(isHexColor("")).toBe(false);
  });
});

describe("heatBackground", () => {
  it("interpolates between the heatmap CSS vars at the shade percentage", () => {
    expect(heatBackground(0)).toBe("color-mix(in oklab, var(--heat-to) 0%, var(--heat-from))");
    expect(heatBackground(0.5)).toBe("color-mix(in oklab, var(--heat-to) 50%, var(--heat-from))");
    expect(heatBackground(1)).toBe("color-mix(in oklab, var(--heat-to) 100%, var(--heat-from))");
  });
  it("clamps out-of-range shades to [0,100]%", () => {
    expect(heatBackground(-2)).toContain("var(--heat-to) 0%");
    expect(heatBackground(5)).toContain("var(--heat-to) 100%");
  });
});

/** WCAG relative luminance + contrast ratio, re-derived here so the test
 * checks heatTextColor's output against AA independently of its internals. */
function relLum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(hexA: string, hexB: string): number {
  const [a, b] = [relLum(hexA), relLum(hexB)];
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
/** Approximates the same heatmap-endpoint interpolation heatTextColor lerps. */
function mixHex(from: string, to: string, t: number): string {
  const [fr, fg, fb] = [1, 3, 5].map((i) => parseInt(from.slice(i, i + 2), 16));
  const [tr, tg, tb] = [1, 3, 5].map((i) => parseInt(to.slice(i, i + 2), 16));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `#${[mix(fr, tr), mix(fg, tg), mix(fb, tb)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

describe("heatTextColor", () => {
  it("picks dark text on the light end and light text on the dark end (default)", () => {
    expect(heatTextColor(0, DEFAULT_THEME)).toBe("#000000");
    expect(heatTextColor(1, DEFAULT_THEME)).toBe("#ffffff");
  });
  it("keeps dark text when the dark end is actually pale", () => {
    const pale: Theme = { ...DEFAULT_THEME, heatFrom: "#ffffff", heatTo: "#fde68a" };
    expect(heatTextColor(1, pale)).toBe("#000000");
  });
  it("giữ contrast AA (≥4.5:1) ở mọi shade cho mọi preset dựng sẵn — kể cả dải giữa gradient", () => {
    for (const preset of THEME_PRESETS) {
      for (let i = 0; i <= 20; i++) {
        const shade = i / 20;
        const text = heatTextColor(shade, preset.theme);
        const bg = mixHex(preset.theme.heatFrom, preset.theme.heatTo, shade);
        expect(contrast(text, bg), `${preset.id} @ shade ${shade}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("isDarkColor", () => {
  it("classifies the built-in backgrounds", () => {
    expect(isDarkColor(DEFAULT_THEME.bg)).toBe(false);
    expect(isDarkColor(DARK_THEME.bg)).toBe(true);
  });
});

describe("contrastOf", () => {
  it("black vs white is the maximum ratio (21:1)", () => {
    expect(contrastOf("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
  it("same colour twice is the minimum ratio (1:1)", () => {
    expect(contrastOf("#2b4c7e", "#2b4c7e")).toBeCloseTo(1, 5);
  });
  it("is symmetric", () => {
    expect(contrastOf(DEFAULT_THEME.fg, DEFAULT_THEME.bg)).toBeCloseTo(
      contrastOf(DEFAULT_THEME.bg, DEFAULT_THEME.fg),
      5,
    );
  });
  it("mọi preset dựng sẵn đạt AA (≥4.5:1) giữa fg và bg", () => {
    for (const preset of THEME_PRESETS) {
      expect(contrastOf(preset.theme.fg, preset.theme.bg), preset.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("applyTheme", () => {
  const makeRoot = () => {
    const calls: Record<string, string> = {};
    const style = { setProperty: (k: string, v: string) => { calls[k] = v; }, colorScheme: "" };
    return { calls, style, root: { style } as unknown as HTMLElement };
  };

  it("writes every field to its CSS custom property", () => {
    const { calls, root } = makeRoot();

    applyTheme(DEFAULT_THEME, root);

    expect(calls["--accent"]).toBe(DEFAULT_THEME.accent);
    expect(calls["--surface"]).toBe(DEFAULT_THEME.surface);
    expect(calls["--heat-from"]).toBe(DEFAULT_THEME.heatFrom);
    expect(calls["--heat-to"]).toBe(DEFAULT_THEME.heatTo);
    // One CSS var per editable field, no more, no less.
    expect(Object.keys(calls)).toHaveLength(Object.keys(DEFAULT_THEME).length);
  });

  it("flips color-scheme with the background's darkness", () => {
    const light = makeRoot();
    applyTheme(DEFAULT_THEME, light.root);
    expect(light.style.colorScheme).toBe("light");

    const dark = makeRoot();
    applyTheme(DARK_THEME, dark.root);
    expect(dark.style.colorScheme).toBe("dark");
  });
});

describe("loadTheme / saveTheme", () => {
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

  it("round-trips a saved theme", () => {
    const custom: Theme = { ...DEFAULT_THEME, accent: "#123456", heatTo: "#000000" };
    saveTheme(custom);
    expect(loadTheme()).toEqual(custom);
  });

  it("back-fills missing fields from the default", () => {
    localStorage.setItem("gioitu.theme.v1", JSON.stringify({ accent: "#abcdef" }));
    const loaded = loadTheme();
    expect(loaded.accent).toBe("#abcdef");
    expect(loaded.heatTo).toBe(DEFAULT_THEME.heatTo);
  });

  it("falls back to the default on malformed data", () => {
    localStorage.setItem("gioitu.theme.v1", "{not valid json");
    expect(loadTheme()).toEqual(DEFAULT_THEME);
  });

  it("returns the default when nothing is stored", () => {
    expect(loadTheme()).toEqual(DEFAULT_THEME);
  });

  describe("with an OS dark preference", () => {
    // Node has no `window`; fake just the matchMedia gate loadTheme consults.
    beforeEach(() => {
      (globalThis as unknown as { window: unknown }).window = {
        matchMedia: (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" }),
      };
    });
    afterEach(() => {
      delete (globalThis as { window?: unknown }).window;
    });

    it("first-time visitors get the dark palette", () => {
      expect(loadTheme()).toEqual(DARK_THEME);
    });

    it("a saved theme still wins over the OS preference", () => {
      saveTheme(DEFAULT_THEME);
      expect(loadTheme()).toEqual(DEFAULT_THEME);
    });
  });
});

describe("THEME_PRESETS", () => {
  const keys = Object.keys(DEFAULT_THEME) as (keyof Theme)[];

  it("every preset defines all fields as valid hex colours", () => {
    for (const preset of THEME_PRESETS) {
      for (const key of keys) {
        expect(isHexColor(preset.theme[key]), `${preset.id}.${key} = ${preset.theme[key]}`).toBe(true);
      }
    }
  });

  it("has unique preset ids", () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps body text readable on the page background in every preset", () => {
    for (const preset of THEME_PRESETS) {
      // Nền tối phải đi với chữ sáng và ngược lại — đủ để không "chữ chìm nền".
      expect(
        isDarkColor(preset.theme.bg) !== isDarkColor(preset.theme.fg),
        `${preset.id}: fg ${preset.theme.fg} on bg ${preset.theme.bg}`,
      ).toBe(true);
    }
  });
});

describe("decorated presets (background + icons)", () => {
  const decorated = THEME_PRESETS.filter((p) => p.background != null);

  it("ships the four character presets", () => {
    expect(decorated.map((p) => p.id)).toEqual(["buu", "cell", "panda", "akatsuki"]);
  });

  it("keeps the background subtle: opacity in (0, 0.5]", () => {
    for (const preset of decorated) {
      expect(preset.background!.opacity, preset.id).toBeGreaterThan(0);
      expect(preset.background!.opacity, preset.id).toBeLessThanOrEqual(0.5);
    }
  });

  it("every decorated preset also names its icon set", () => {
    for (const preset of decorated) {
      expect(preset.icons, preset.id).toBeDefined();
      expect(preset.icons!.emblem.length, preset.id).toBeGreaterThan(0);
      expect(preset.icons!.relapse.length, preset.id).toBeGreaterThan(0);
    }
  });

  it("plain colour presets carry no decor", () => {
    for (const preset of THEME_PRESETS.filter((p) => p.background == null)) {
      expect(preset.icons, preset.id).toBeUndefined();
    }
  });
});

describe("presetById", () => {
  it("finds a preset and returns undefined for null/unknown", () => {
    expect(presetById("akatsuki")?.name).toBe("Akatsuki");
    expect(presetById(null)).toBeUndefined();
    expect(presetById("no-such-theme")).toBeUndefined();
  });
});

describe("loadDecor / saveDecor", () => {
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

  it("round-trips a saved decor", () => {
    const decor: ThemeDecor = { presetId: "cell", effectsEnabled: false };
    saveDecor(decor);
    expect(loadDecor()).toEqual(decor);
  });

  it("returns the default when nothing is stored", () => {
    expect(loadDecor()).toEqual(DEFAULT_DECOR);
  });

  it("falls back per-field on wrong types and malformed data", () => {
    localStorage.setItem("gioitu.decor.v1", JSON.stringify({ presetId: 42, effectsEnabled: "yes" }));
    expect(loadDecor()).toEqual(DEFAULT_DECOR);

    localStorage.setItem("gioitu.decor.v1", "{not valid json");
    expect(loadDecor()).toEqual(DEFAULT_DECOR);
  });
});
