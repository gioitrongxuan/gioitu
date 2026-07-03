// Theme context: holds the active theme, applies it to :root before paint and
// persists every change. Consumers read `theme` (e.g. the word cloud, to pick
// readable tag text) and call `setTheme` from the settings screen for live,
// app-wide preview. Bên cạnh 9 màu còn có `decor` — preset nào đang cấp hiệu
// ứng nền/icon set (ThemeBackdrop và badge word cloud đọc từ đây).

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import {
  Theme,
  ThemeDecor,
  ThemePreset,
  PresetIcons,
  DEFAULT_THEME,
  applyTheme,
  loadTheme,
  saveTheme,
  loadDecor,
  saveDecor,
  presetById,
} from "./domain/theme";

interface ThemeContextValue {
  theme: Theme;
  /** Preset đang cấp trang trí + công tắc hiệu ứng nền. */
  decor: ThemeDecor;
  /** Icon set của preset đang chọn; null = glyph mặc định của app. */
  icons: PresetIcons | null;
  /** Replace the whole theme (live-applied + persisted). */
  setTheme: (theme: Theme) => void;
  /** Patch a single field. */
  setField: (key: keyof Theme, value: string) => void;
  /** Replace decor (live-applied + persisted). */
  setDecor: (decor: ThemeDecor) => void;
  /** Apply a preset wholesale: colours + background/icon set. */
  applyPreset: (preset: ThemePreset) => void;
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
    setDecorState((d) => ({ ...d, presetId: preset.id }));
  }, []);
  const reset = useCallback(() => {
    setThemeState({ ...DEFAULT_THEME });
    setDecorState((d) => ({ ...d, presetId: null }));
  }, []);

  const icons = presetById(decor.presetId)?.icons ?? null;

  return (
    <ThemeContext.Provider value={{ theme, decor, icons, setTheme, setField, setDecor, applyPreset, reset }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
