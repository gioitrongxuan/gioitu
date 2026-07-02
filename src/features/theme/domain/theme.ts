// Theme = the small set of CSS custom properties the app exposes for user
// customization. It is persisted to localStorage and applied to :root so a
// reload keeps the user's palette.
//
// The headline feature is the word-cloud "heatmap": its colour is a gradient
// between two endpoints — `heatFrom` (rarely looked-up words) and `heatTo`
// (most looked-up). Each tag's background is interpolated per-shade at render
// time with CSS `color-mix`, so editing an endpoint restyles the whole cloud.

/** The editable colours. All values are `#rrggbb` hex strings. */
export interface Theme {
  /** Heatmap low end — words with few look-ups. */
  heatFrom: string;
  /** Heatmap high end — the most looked-up words. */
  heatTo: string;
  /** Primary action / link colour. */
  accent: string;
  /** Warning / relapse colour. */
  warn: string;
  /** Page background. */
  bg: string;
  /** Card / panel / input background. */
  surface: string;
  /** Main text colour. */
  fg: string;
  /** Secondary text colour. */
  muted: string;
  /** Hairline / border colour. */
  line: string;
}

/** The built-in palette (mirrors the static :root defaults in styles.css). */
export const DEFAULT_THEME: Theme = {
  heatFrom: "#e8eaee",
  heatTo: "#1b1f26",
  accent: "#2563eb",
  warn: "#dc2626",
  bg: "#ffffff",
  surface: "#ffffff",
  fg: "#1a1a1a",
  muted: "#6b7280",
  line: "#e5e7eb",
};

/**
 * Built-in dark palette. The heatmap inverts: rarely looked-up words sit close
 * to the surface colour and the hottest words glow bright — `heatTextColor`
 * keeps tag text readable either way. Also the default for first-time visitors
 * whose OS prefers dark (see `loadTheme`).
 */
export const DARK_THEME: Theme = {
  heatFrom: "#374151",
  heatTo: "#e5e7eb",
  accent: "#3b82f6",
  warn: "#ef4444",
  bg: "#111827",
  surface: "#1f2937",
  fg: "#e5e7eb",
  muted: "#9ca3af",
  line: "#374151",
};

export interface ThemePreset {
  id: string;
  name: string;
  theme: Theme;
}

/**
 * Ready-made palettes. Each keeps the light card surfaces of the base design
 * but swaps the heatmap gradient + accent so the word cloud reads as a real
 * heatmap (light → hot). Picking a preset is just a shortcut for setting all
 * fields at once; everything stays individually editable afterwards.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "slate",
    name: "Mặc định",
    theme: DEFAULT_THEME,
  },
  {
    id: "dark",
    name: "Tối",
    theme: DARK_THEME,
  },
  {
    id: "ember",
    name: "Nhiệt",
    theme: { ...DEFAULT_THEME, heatFrom: "#fef3c7", heatTo: "#b91c1c", accent: "#ea580c", warn: "#b91c1c" },
  },
  {
    id: "ocean",
    name: "Đại dương",
    theme: { ...DEFAULT_THEME, heatFrom: "#e0f2fe", heatTo: "#0c4a6e", accent: "#0284c7" },
  },
  {
    id: "forest",
    name: "Rừng",
    theme: { ...DEFAULT_THEME, heatFrom: "#ecfccb", heatTo: "#14532d", accent: "#16a34a" },
  },
  {
    id: "grape",
    name: "Nho",
    theme: { ...DEFAULT_THEME, heatFrom: "#f3e8ff", heatTo: "#581c87", accent: "#9333ea" },
  },
];

/** Maps each editable field to its CSS custom property name. */
const VAR_MAP: Record<keyof Theme, string> = {
  heatFrom: "--heat-from",
  heatTo: "--heat-to",
  accent: "--accent",
  warn: "--warn",
  bg: "--bg",
  surface: "--surface",
  fg: "--fg",
  muted: "--muted",
  line: "--line",
};

const THEME_KEYS = Object.keys(VAR_MAP) as (keyof Theme)[];

/**
 * Push a theme onto the document (or any element) as CSS custom properties.
 * Also flips `color-scheme` so native widgets (scrollbars, form controls,
 * `<input type=color>`…) match a dark palette.
 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  for (const key of THEME_KEYS) root.style.setProperty(VAR_MAP[key], theme[key]);
  root.style.colorScheme = isDarkColor(theme.bg) ? "dark" : "light";
}

const STORAGE_KEY = "gioitu.theme.v1";

/**
 * Read the saved theme, falling back to (and back-filling from) the default.
 * First-time visitors (nothing stored) get light or dark following the OS
 * preference; after that the choice is persisted and no longer tracks the OS —
 * the presets in settings are the way to switch.
 */
export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_THEME, ...(JSON.parse(raw) as Partial<Theme>) };
  } catch {
    /* malformed / unavailable storage — fall through to default */
  }
  return prefersDark() ? { ...DARK_THEME } : { ...DEFAULT_THEME };
}

/** OS-level dark preference; false outside a browser (tests). */
function prefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

/** Persist a theme; ignores storage failures (private mode, quota, …). */
export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    /* ignore */
  }
}

/** Whether a string is a usable `#rrggbb` colour. */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Background for a word-cloud tag at the given shade in [0,1]. Interpolated
 * between the two heatmap endpoints via CSS `color-mix`, reading the live
 * `--heat-from` / `--heat-to` custom properties — so it always reflects the
 * current theme without re-render plumbing.
 */
export function heatBackground(shade: number): string {
  const pct = Math.round(clamp01(shade) * 100);
  return `color-mix(in oklab, var(--heat-to) ${pct}%, var(--heat-from))`;
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance of an sRGB triplet (channels 0–255). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Whether a `#rrggbb` colour is dark enough to call the theme "dark". */
export function isDarkColor(hex: string): boolean {
  return relativeLuminance(parseHex(hex)) < 0.4;
}

/**
 * Readable text colour for a tag at the given shade. We approximate the
 * interpolated background by lerping the two endpoints and pick light or dark
 * text by its luminance, so contrast holds for any heatmap palette.
 */
export function heatTextColor(shade: number, theme: Theme): string {
  const t = clamp01(shade);
  const a = parseHex(theme.heatFrom);
  const b = parseHex(theme.heatTo);
  const mixed: [number, number, number] = [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  return relativeLuminance(mixed) < 0.4 ? "#f5f5f5" : "#1a1a1a";
}
