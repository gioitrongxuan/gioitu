// Term meta (Yomitan `term_meta_bank_*.json`): per-term annotations that are NOT
// glossaries — pronunciation (IPA), pitch accent, frequency. Like Yomitan, these
// live apart from the headword glosses and are *attached* to a term at look-up
// time, enriching whatever gloss entry was found. A meta-only dictionary (e.g.
// `wty-ja-vi-ipa`) therefore adds no headwords of its own; it decorates existing
// ones. Only IPA is rendered today; pitch/freq rows are stored for the future.

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
