// Theme context: holds the active theme, applies it to :root before paint and
// persists every change. Consumers read `theme` (e.g. the word cloud, to pick
// readable tag text) and call `setTheme` from the settings screen for live,
// app-wide preview. Bên cạnh 9 màu còn có `decor` — preset nào đang cấp hiệu
// ứng nền (ThemeBackdrop đọc từ đây).

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import {
  Theme,
  ThemeDecor,
  ThemePreset,
  DEFAULT_THEME,
  applyTheme,
  loadTheme,
  saveTheme,
  loadDecor,
  saveDecor,
} from "./domain/theme";
import { ThemeSkin } from "./domain/skins";

interface ThemeContextValue {
  theme: Theme;
  /** Skin đang cấp trang trí + công tắc hiệu ứng nền. */
  decor: ThemeDecor;
  /** Replace the whole theme (live-applied + persisted). */
  setTheme: (theme: Theme) => void;
  /** Patch a single field. */
  setField: (key: keyof Theme, value: string) => void;
  /** Replace decor (live-applied + persisted). */
  setDecor: (decor: ThemeDecor) => void;
  /** Apply a colour preset wholesale (rời skin đang mặc — xem applyPreset). */
  applyPreset: (preset: ThemePreset) => void;
  /** Mặc một skin: chỉ backdrop + hai đầu heatmap, token chữ/nền giữ nguyên. */
  applySkin: (skin: ThemeSkin) => void;
  /** Restore the built-in default palette (and drop any decor). */
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const [decor, setDecorState] = useState<ThemeDecor>(loadDecor);

  // Layout effect so the palette is applied before the browser paints, even on
  // the very first commit — no flash of the static default colours.
  useLayoutEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
    // Tint the browser chrome (mobile address bar) to match the page.
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.bg);
  }, [theme]);

  // Decor không ảnh hưởng paint đầu tiên (backdrop lazy) — effect thường là đủ.
  useEffect(() => saveDecor(decor), [decor]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const setField = useCallback(
    (key: keyof Theme, value: string) => setThemeState((t) => ({ ...t, [key]: value })),
    [],
  );
  const setDecor = useCallback((next: ThemeDecor) => setDecorState(next), []);
  const applyPreset = useCallback((preset: ThemePreset) => {
    setThemeState({ ...preset.theme });
    // Preset màu không cấp trang trí: chọn palette là rời skin (giữ hành vi cũ
    // — trước đây presetId trỏ sang palette cũng làm backdrop tắt).
    setDecorState((d) => ({ ...d, presetId: null }));
  }, []);
  const applySkin = useCallback((skin: ThemeSkin) => {
    // Skin chỉ chạm hai đầu heatmap + backdrop; bảng màu nền/chữ người dùng
    // đang dùng (sáng hay tối) giữ nguyên để không phá tương phản (DESIGN §1).
    setThemeState((t) => ({ ...t, ...skin.heat }));
    setDecorState((d) => ({ ...d, presetId: skin.id }));
  }, []);
  const reset = useCallback(() => {
    setThemeState({ ...DEFAULT_THEME });
    setDecorState((d) => ({ ...d, presetId: null }));
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, decor, setTheme, setField, setDecor, applyPreset, applySkin, reset }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
