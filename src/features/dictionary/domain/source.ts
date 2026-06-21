// Which dictionary database look-ups run against. The user picks this explicitly
// (SearchBar toggle); there is no automatic client→server fallback, so a query
// always resolves against exactly the chosen source. Pure + persisted like the
// theme setting (localStorage), so it survives reloads.

export type DictSource = "local" | "server";

/** Toggle options, in display order. UI labels are Vietnamese. */
export const SOURCE_OPTIONS: { value: DictSource; label: string }[] = [
  { value: "local", label: "Trên máy" },
  { value: "server", label: "Server" },
];

const STORAGE_KEY = "gioitu.dictSource.v1";

/** The saved choice, or null if the user has never picked one. */
export function loadSource(): DictSource | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "local" || raw === "server") return raw;
  } catch {
    /* storage unavailable (private mode) — treat as no choice */
  }
  return null;
}

export function saveSource(source: DictSource): void {
  try {
    localStorage.setItem(STORAGE_KEY, source);
  } catch {
    /* ignore */
  }
}
