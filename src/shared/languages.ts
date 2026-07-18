// Language pairs (dictionaries). Each pair is a forward dictionary: you type a
// term in `source` and get its meaning in `target`. Four dictionaries are
// supported; the user picks which one to search.

export type LangCode = "ja" | "vi" | "en";

export interface LangPair {
  /** Stable id, also used as a dictionary scope key. */
  id: string;
  /** Language you type in (term_lang of the looked-up entry). */
  source: LangCode;
  /** Language of the returned meaning (native_lang of the entry). */
  target: LangCode;
  /** Human label for the selector. */
  label: string;
}

export const LANG_PAIRS: LangPair[] = [
  { id: "ja-vi", source: "ja", target: "vi", label: "Nhật → Việt" },
  { id: "vi-ja", source: "vi", target: "ja", label: "Việt → Nhật" },
  { id: "ja-en", source: "ja", target: "en", label: "Nhật → Anh" },
  { id: "en-ja", source: "en", target: "ja", label: "Anh → Nhật" },
  { id: "en-vi", source: "en", target: "vi", label: "Anh → Việt" },
  { id: "vi-en", source: "vi", target: "en", label: "Việt → Anh" },
];

export const DEFAULT_PAIR = LANG_PAIRS.find((p) => p.id === "ja-vi")!; // Nhật → Việt

export function pairById(id: string): LangPair {
  return LANG_PAIRS.find((p) => p.id === id) ?? DEFAULT_PAIR;
}

export function pairId(source: string, target: string): string {
  return `${source}-${target}`;
}
