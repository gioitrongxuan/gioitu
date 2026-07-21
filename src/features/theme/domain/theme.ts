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

/**
 * The built-in palette — washi/sumi (DESIGN §1). PHẢI khớp các mặc định tĩnh
 * ở :root trong styles.css (cùng inline script chống nháy trong index.html):
 * lệch nhau là nháy màu khi React mount.
 */
export const DEFAULT_THEME: Theme = {
  heatFrom: "#e8eaee",
  heatTo: "#1b1f26",
  accent: "#2b4c7e", // chàm aizome
  warn: "#dc2626",
  // Giấy washi ấm; surface trắng ngà nổi khối nhẹ trên nền (bớt phẳng/khô).
  bg: "#f7f4ee",
  surface: "#fffdf9",
  fg: "#211f1a", // mực sumi
  muted: "#6f6a5d",
  line: "#e3dccb",
};

/**
 * Built-in dark palette — yozora (bầu trời đêm, DESIGN §1). The heatmap inverts:
 * rarely looked-up words sit close to the surface colour and the hottest words
 * glow bright — `heatTextColor` keeps tag text readable either way. Also the
 * default for first-time visitors whose OS prefers dark (see `loadTheme`). PHẢI
 * khớp nhánh @media (prefers-color-scheme: dark) trong styles.css.
 */
export const DARK_THEME: Theme = {
  heatFrom: "#374151",
  heatTo: "#e5e7eb",
  accent: "#8fb0dd", // aizome nhạt cho nền tối
  warn: "#ef4444",
  bg: "#141317",
  surface: "#1e1d22",
  fg: "#e8e4da",
  muted: "#a29c8c",
  line: "#37343c",
};

/** Effect keys — each maps to a lazy-loaded component in presets/registry. */
export type BackgroundEffect = "buu" | "cell" | "bamboo" | "akatsuki";

/** Drift speed of the decorative pattern; "none" freezes it entirely. */
export type BackgroundSpeed = "none" | "slow" | "medium";

/**
 * Decorative page background of a preset, rendered by ui/ThemeBackdrop behind
 * all content. Pure data — the actual visuals (SVG/CSS/images) live in
 * presets/<effect>/ and are only downloaded when the preset is picked.
 */
export interface PresetBackground {
  effect: BackgroundEffect;
  speed: BackgroundSpeed;
  /** Max opacity of the whole layer (0–1] — kept low so text stays readable. */
  opacity: number;
}

/** Themed glyphs for tags/badges; absent fields fall back to app defaults. */
export interface PresetIcons {
  /** Signature glyph shown on the preset chip in settings. */
  emblem: string;
  /** Replaces the default "!" relapse badge on word-cloud tags. */
  relapse: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  theme: Theme;
  /** Decorative background; plain colour presets simply omit it. */
  background?: PresetBackground;
  /** Themed icon set; omit to keep the app's default glyphs. */
  icons?: PresetIcons;
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
  // ---- Bộ theme trang trí: màu + icon + hiệu ứng nền (presets/<effect>/). ----
  {
    id: "buu",
    name: "Majin Buu",
    theme: {
      heatFrom: "#fbcfe8",
      heatTo: "#701a75",
      accent: "#db2777",
      warn: "#dc2626",
      bg: "#fdf2f8",
      surface: "#ffffff",
      fg: "#4a1033",
      muted: "#9d5c7d",
      line: "#f3d3e3",
    },
    background: { effect: "buu", speed: "slow", opacity: 0.35 },
    icons: { emblem: "🍬", relapse: "💢" },
  },
  {
    id: "cell",
    name: "Cell",
    theme: {
      heatFrom: "#1d3524",
      heatTo: "#a3e635",
      accent: "#4ade80",
      warn: "#f87171",
      bg: "#0c1510",
      surface: "#16241a",
      fg: "#dcefe0",
      muted: "#93ac9b",
      line: "#28402e",
    },
    background: { effect: "cell", speed: "slow", opacity: 0.3 },
    icons: { emblem: "🧬", relapse: "☣" },
  },
  {
    id: "panda",
    name: "Rừng trúc",
    theme: {
      heatFrom: "#e4efd8",
      heatTo: "#1c1c1c",
      accent: "#15803d",
      warn: "#dc2626",
      bg: "#f4f8ef",
      surface: "#ffffff",
      fg: "#232a20",
      muted: "#6b7a64",
      line: "#dde7d4",
    },
    background: { effect: "bamboo", speed: "slow", opacity: 0.3 },
    icons: { emblem: "🐼", relapse: "🐾" },
  },
  {
    id: "akatsuki",
    name: "Akatsuki",
    theme: {
      heatFrom: "#33212a",
      heatTo: "#ef4444",
      accent: "#ef4444",
      warn: "#f59e0b",
      bg: "#0f0b0d",
      surface: "#1c1418",
      fg: "#ece4e4",
      muted: "#a18f93",
      line: "#3a2b30",
    },
    background: { effect: "akatsuki", speed: "slow", opacity: 0.35 },
    icons: { emblem: "☁️", relapse: "◉" },
  },
];

/** The preset with the given id, or undefined (id null = no decor chosen). */
export function presetById(id: string | null): ThemePreset | undefined {
  return id == null ? undefined : THEME_PRESETS.find((p) => p.id === id);
}

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

// ---------------------------------------------------------------------------
// Decor — phần "ngoài màu" của bộ theme: preset nào đang cấp hiệu ứng nền /
// icon set, và người dùng có muốn hiện hiệu ứng hay không. Tách khỏi Theme để
// giữ nguyên hợp đồng 9 màu (applyTheme và localStorage cũ không đổi).

export interface ThemeDecor {
  /** Preset cấp background/icons; null = chỉ dùng màu, không trang trí. */
  presetId: string | null;
  /** Công tắc riêng: tắt khi hiệu ứng nền gây xao nhãng lúc học. */
  effectsEnabled: boolean;
}

export const DEFAULT_DECOR: ThemeDecor = { presetId: null, effectsEnabled: true };

const DECOR_KEY = "gioitu.decor.v1";

/** Read the saved decor; wrong types or malformed JSON fall back per-field. */
export function loadDecor(): ThemeDecor {
  try {
    const raw = localStorage.getItem(DECOR_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemeDecor>;
      return {
        presetId: typeof parsed.presetId === "string" ? parsed.presetId : DEFAULT_DECOR.presetId,
        effectsEnabled:
          typeof parsed.effectsEnabled === "boolean" ? parsed.effectsEnabled : DEFAULT_DECOR.effectsEnabled,
      };
    }
  } catch {
    /* malformed / unavailable storage — fall through to default */
  }
  return { ...DEFAULT_DECOR };
}

/** Persist decor; ignores storage failures (private mode, quota, …). */
export function saveDecor(decor: ThemeDecor): void {
  try {
    localStorage.setItem(DECOR_KEY, JSON.stringify(decor));
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

/** WCAG contrast ratio between two relative luminances. */
function contrastRatio(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * WCAG contrast ratio between two `#rrggbb` colours — dùng để cảnh báo trong
 * theme editor khi người dùng tự đặt fg≈bg (#128), lúc palette đang soạn dở
 * chưa chắc đã tuân AA như 2 preset dựng sẵn (theme.test.ts chỉ khoá bộ có sẵn).
 */
export function contrastOf(hexA: string, hexB: string): number {
  return contrastRatio(relativeLuminance(parseHex(hexA)), relativeLuminance(parseHex(hexB)));
}

const HEAT_TEXT_WHITE = "#ffffff";
const HEAT_TEXT_BLACK = "#000000";
const HEAT_TEXT_WHITE_LUM = relativeLuminance(parseHex(HEAT_TEXT_WHITE));
const HEAT_TEXT_BLACK_LUM = relativeLuminance(parseHex(HEAT_TEXT_BLACK));

/** Picks whichever of pure white/black wins the REAL contrast ratio against a
 * background luminance — not a fixed luminance threshold, which lets a
 * background land at ~2.2–3.5:1 on either choice. */
function bestTextFor(bgLum: number): string {
  const whiteContrast = contrastRatio(bgLum, HEAT_TEXT_WHITE_LUM);
  const blackContrast = contrastRatio(bgLum, HEAT_TEXT_BLACK_LUM);
  return whiteContrast >= blackContrast ? HEAT_TEXT_WHITE : HEAT_TEXT_BLACK;
}

/**
 * Readable text colour for a tag at the given shade. Approximates the
 * interpolated background by lerping the two heatmap endpoints, then picks
 * the best of pure white/black (see `bestTextFor`) — that combination is what
 * keeps every shade ≥ 4.5:1 across the built-in presets (see theme.test.ts);
 * the previously softened #f5f5f5/#1a1a1a pair did not.
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
  return bestTextFor(relativeLuminance(mixed));
}

/**
 * Readable text colour (white or black) for an arbitrary `#rrggbb` background —
 * used where a UI paints a solid semantic colour (e.g. review grade buttons)
 * and needs AA contrast to hold across every theme/preset, not just the
 * default. See `heatTextColor` for the same approach applied to a gradient.
 */
export function readableTextOn(hex: string): string {
  return bestTextFor(relativeLuminance(parseHex(hex)));
}

/**
 * `--ok` / `--caution` (styles.css) — fixed semantic tokens, not part of the
 * user-customizable `Theme` palette, mirrored here for components that need
 * to compute readable text against them (review grade buttons: hard/good).
 * Khớp styles.css — lệch là badge/nút mất tương phản.
 */
export const FIXED_OK = "#16a34a";
export const FIXED_CAUTION = "#d97706";
