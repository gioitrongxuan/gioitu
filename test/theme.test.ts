import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  applyTheme,
  loadTheme,
  saveTheme,
  isHexColor,
  heatBackground,
  heatTextColor,
  type Theme,
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

describe("heatTextColor", () => {
  it("picks dark text on the light end and light text on the dark end (default)", () => {
    expect(heatTextColor(0, DEFAULT_THEME)).toBe("#1a1a1a");
    expect(heatTextColor(1, DEFAULT_THEME)).toBe("#f5f5f5");
  });
  it("keeps dark text when the dark end is actually pale", () => {
    const pale: Theme = { ...DEFAULT_THEME, heatFrom: "#ffffff", heatTo: "#fde68a" };
    expect(heatTextColor(1, pale)).toBe("#1a1a1a");
  });
});

describe("applyTheme", () => {
  it("writes every field to its CSS custom property", () => {
    const calls: Record<string, string> = {};
    const root = {
      style: { setProperty: (k: string, v: string) => { calls[k] = v; } },
    } as unknown as HTMLElement;

    applyTheme(DEFAULT_THEME, root);

    expect(calls["--accent"]).toBe(DEFAULT_THEME.accent);
    expect(calls["--heat-from"]).toBe(DEFAULT_THEME.heatFrom);
    expect(calls["--heat-to"]).toBe(DEFAULT_THEME.heatTo);
    // One CSS var per editable field, no more, no less.
    expect(Object.keys(calls)).toHaveLength(Object.keys(DEFAULT_THEME).length);
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
});
