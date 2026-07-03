// Term meta (Yomitan `term_meta_bank_*.json`): per-term annotations that are NOT
// glossaries — pronunciation (IPA), pitch accent, frequency. Like Yomitan, these
// live apart from the headword glosses and are *attached* to a term at look-up
// time, enriching whatever gloss entry was found. A meta-only dictionary (e.g.
// `wty-ja-vi-ipa`) therefore adds no headwords of its own; it decorates existing
// ones. IPA and frequency are rendered; pitch rows are stored for the future.

/** A Yomitan term-meta row: [term, mode, data] — `data` shape depends on mode. */
export type TermMetaRow = [string, TermMetaMode, unknown];

export type TermMetaMode = "ipa" | "pitch" | "freq";

export interface IpaTranscription {
  ipa: string;
  /** Accent/region labels, e.g. ["Hanoi"], ["Saigon"]. */
  tags?: string[];
}

export interface IpaMetaData {
  reading: string;
  transcriptions: IpaTranscription[];
}

/**
 * One stored term-meta annotation. `data` is mode-specific; the consumer narrows
 * by `mode`. `dictId` / `dictionary` are filled in when the row is persisted.
 */
export interface TermMetaEntry {
  term: string;
  reading: string;
  mode: TermMetaMode;
  data: unknown;
  term_lang: string;
  native_lang: string;
  dictId?: string;
  dictionary?: string;
}

/** One dictionary's IPA transcriptions for a term, ready to render. */
export interface Pronunciation {
  dictionary?: string;
  transcriptions: IpaTranscription[];
}

/**
 * Select the IPA pronunciations that apply to an entry. Prefer rows whose meta
 * reading matches the entry's reading; if none match (the wty data often stores
 * the term itself as the "reading"), fall back to every IPA row for the term.
 * Pure: no I/O, easy to test.
 */
export function ipaPronunciations(meta: TermMetaEntry[], reading?: string): Pronunciation[] {
  const ipa = meta.filter((m) => m.mode === "ipa");
  if (ipa.length === 0) return [];

  const matched = reading ? ipa.filter((m) => m.reading === reading) : [];
  const rows = matched.length ? matched : ipa;

  const out: Pronunciation[] = [];
  for (const m of rows) {
    const data = m.data as IpaMetaData | undefined;
    const transcriptions = (data?.transcriptions ?? []).filter((t) => t && t.ipa);
    if (transcriptions.length) out.push({ dictionary: m.dictionary, transcriptions });
  }
  return out;
}

/**
 * One frequency dictionary's rank for a term, ready to render as a chip.
 * External corpus data (Anime, News, Wiki…) — NOT the user's own lookup count.
 */
export interface TermFrequency {
  dictionary?: string;
  /** The label to show — the dictionary's displayValue when it provides one. */
  display: string;
  /** Numeric rank when known; smaller = more common. */
  value?: number;
}

/**
 * Yomitan freq `data` is loosely shaped: a bare number/string, `{value,
 * displayValue}`, or reading-scoped `{reading, frequency}` wrapping either.
 */
function parseFrequencyData(data: unknown): { display: string; value?: number } | null {
  if (typeof data === "number") return { display: String(data), value: data };
  if (typeof data === "string") {
    const n = Number(data);
    return { display: data, value: Number.isFinite(n) ? n : undefined };
  }
  if (data && typeof data === "object") {
    const obj = data as { frequency?: unknown; value?: unknown; displayValue?: unknown };
    if (obj.frequency !== undefined) return parseFrequencyData(obj.frequency);
    if (typeof obj.value === "number") {
      return {
        display: typeof obj.displayValue === "string" ? obj.displayValue : String(obj.value),
        value: obj.value,
      };
    }
    if (typeof obj.displayValue === "string") return { display: obj.displayValue };
  }
  return null;
}

/**
 * Select the frequency ranks that apply to an entry, one per source dictionary
 * (keeping the best — smallest — rank). A row with its own reading only applies
 * to that reading (homographs); an empty reading applies to any. If nothing
 * matches, fall back to every freq row, like IPA does — some dictionaries store
 * the term itself in the reading field. Pure: no I/O, easy to test.
 */
export function frequencyRanks(meta: TermMetaEntry[], reading?: string): TermFrequency[] {
  const freq = meta.filter((m) => m.mode === "freq");
  if (freq.length === 0) return [];

  const applicable = reading ? freq.filter((m) => !m.reading || m.reading === reading) : freq;
  const rows = applicable.length ? applicable : freq;

  const byDict = new Map<string, TermFrequency>();
  for (const m of rows) {
    const parsed = parseFrequencyData(m.data);
    if (!parsed) continue;
    const key = m.dictionary ?? "";
    const prev = byDict.get(key);
    const isBetter = parsed.value != null && (prev?.value == null || parsed.value < prev.value);
    if (!prev || isBetter) byDict.set(key, { dictionary: m.dictionary, ...parsed });
  }
  return [...byDict.values()];
}
