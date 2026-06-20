// Theme context: holds the active theme, applies it to :root before paint and
// persists every change. Consumers read `theme` (e.g. the word cloud, to pick
// readable tag text) and call `setTheme` from the settings screen for live,
// app-wide preview.

import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { Theme, DEFAULT_THEME, applyTheme, loadTheme, saveTheme } from "./domain/theme";

interface ThemeContextValue {
  theme: Theme;
  /** Replace the whole theme (live-applied + persisted). */
  setTheme: (theme: Theme) => void;
  /** Patch a single field. */
  setField: (key: keyof Theme, value: string) => void;
  /** Restore the built-in default palette. */
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(loadTheme);

  // Layout effect so the palette is applied before the browser paints, even on
  // the very first commit — no flash of the static default colours.
  useLayoutEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const setField = useCallback(
    (key: keyof Theme, value: string) => setThemeState((t) => ({ ...t, [key]: value })),
    [],
  );
  const reset = useCallback(() => setThemeState({ ...DEFAULT_THEME }), []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, setField, reset }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
