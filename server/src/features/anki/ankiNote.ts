// Pure domain: turn a Yomitan note (the fields behind a "+") into a VocabEntry
// in the user's SRS list. No I/O — the store wraps these. Pressing "+" in
// Yomitan is a *manual add* (asserts intent to learn), so a brand-new word gets
// an SRS card immediately, bypassing the web app's lookup-count gate.
//
// The card/entry shape mirrors src/features/review/domain/{lookup,srs}.ts
// (createEntry + newCardState, manual-add path). Kept as an independent copy
// because the backend does not depend on frontend code — keep the two in sync.

import type { VocabEntry } from "@/shared/types";

// Mirror of DEFAULT_SRS_CONFIG.initialEaseFactor (review/domain/constants.ts).
const INITIAL_EASE_FACTOR = 2.5;

/** The note fields Yomitan posts, keyed by FIELD_NAMES (all optional but Word). */
export interface NoteFields {
  Word?: string;
  Reading?: string;
  Glossary?: string;
  Sentence?: string;
  PartOfSpeech?: string;
  [key: string]: unknown;
}

/** What addNote needs once the fields are parsed and the user is known. */
export interface ManualAddInput {
  user_id: string;
  term: string;
  term_lang: string;
  native_lang: string;
  meaning: string;
  /** Kana reading (for furigana); empty/equal-to-term is fine. */
  reading?: string;
  /** Part-of-speech text (for tag chips). */
  pos?: string;
  /** Example sentence (kept apart from the glosses). */
  example?: string;
}

/** Optional language-pair pin (from ?src=&tgt= on the endpoint URL). */
export interface SaveNoteOptions {
  srcLang?: string;
  tgtLang?: string;
}

// Hiragana, katakana, CJK ideographs, or halfwidth katakana ⇒ Japanese.
const JAPANESE_CHAR = /[぀-ヿ㐀-鿿ｦ-ﾟ]/;

/**
 * Guess the term's language from its surface (and reading): anything with
 * Japanese characters is "ja", otherwise "en". The native (meaning) language is
 * chosen by the caller; this only classifies the headword.
 */
export function detectTermLang(word: string, reading?: string): "ja" | "en" {
  return JAPANESE_CHAR.test(word) || (reading != null && JAPANESE_CHAR.test(reading))
    ? "ja"
    : "en";
}

// Cap how many definition lines we keep, so a pathological glossary cannot
// bloat the stored entry.
const MAX_MEANING_LINES = 30;

const HTML_TAG = /<[^>]+>/g;

function safeCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

/** Decode the handful of HTML entities a glossary realistically contains. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&amp;/gi, "&"); // last, so "&amp;lt;" does not become "<"
}

/** Strip tags from one fragment and normalise its whitespace to a single line. */
function cleanText(s: string): string {
  return decodeEntities(s.replace(HTML_TAG, " ")).replace(/\s+/g, " ").trim();
}

const looksLikeHtml = (s: string): boolean => /<\w+[\s/>]/.test(s);

const dropConsecutiveDuplicates = (lines: string[]): string[] =>
  lines.filter((line, i) => line !== lines[i - 1]);

/**
 * Reduce a Yomitan `{glossary}` HTML blob to clean definition lines. Yomitan
 * sends rich HTML (with an inline `<style>` block); we drop style/script, then
 * prefer the leaf list items (the actual glosses) and fall back to a plain
 * block-aware strip for dictionaries that do not use lists.
 */
function htmlToLines(html: string): string[] {
  const stripped = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");

  // Leaf <li> = a list item that contains no nested list/item: the glosses.
  const leaves = [...stripped.matchAll(/<li\b[^>]*>((?:(?!<li\b|<\/li>|<[uo]l\b)[\s\S])*?)<\/li>/gi)]
    .map((m) => cleanText(m[1]))
    .filter(Boolean);
  if (leaves.length) return dropConsecutiveDuplicates(leaves);

  const text = stripped
    .replace(/<(?:\/(?:p|div|li|ul|ol|tr|h[1-6])|br\s*\/?)\s*>/gi, "\n")
    .replace(HTML_TAG, " ");
  return dropConsecutiveDuplicates(
    text.split("\n").map((line) => decodeEntities(line).replace(/\s+/g, " ").trim()).filter(Boolean),
  );
}

const plainLines = (s: string): string[] =>
  s.split(/\r?\n/).map((line) => decodeEntities(line).replace(/[ \t]+/g, " ").trim()).filter(Boolean);

/**
 * Build the entry's `meaning` (a JSON `string[]`, the shape the rest of the app
 * stores) from the Glossary alone — its HTML cleaned to definition lines when
 * Yomitan maps the rich `{glossary}`. The example Sentence is kept separate (see
 * fieldsToExample) so it is not numbered among the glosses.
 */
export function fieldsToMeaning(fields: NoteFields): string {
  const glossary = typeof fields.Glossary === "string" ? fields.Glossary : "";
  const lines = looksLikeHtml(glossary) ? htmlToLines(glossary) : plainLines(glossary);
  return JSON.stringify(lines.slice(0, MAX_MEANING_LINES));
}

/** The example sentence (Yomitan `{sentence}`), cleaned to plain text. */
export function fieldsToExample(fields: NoteFields): string {
  return typeof fields.Sentence === "string" ? cleanText(fields.Sentence) : "";
}

/** The fields of a freshly-created SRS card (mirror of srs.ts newCardState). */
function newCard(now: number) {
  return {
    status: "LEARNING" as const,
    card_state: "NEW" as const,
    learning_step: 0,
    ease_factor: INITIAL_EASE_FACTOR,
    reps: 0,
    lapses: 0,
    is_relearning: false,
    srs_interval: 0,
    next_review: now,
  };
}

/**
 * Apply a Yomitan "+" to the user's existing entry (or undefined for a new
 * word) and return the next entry. Never mutates its input.
 *
 * - New (or previously deleted ⇒ resurrected): a fresh entry with an SRS card.
 * - Existing: count the re-add, refresh the meaning, and create a card if the
 *   word never reached the web app's gating threshold — but never reset the
 *   user's learning progress. Relapsing a LEARNED word is intentionally left to
 *   the web app, which owns the SM-2 engine; here we only bump the lookup
 *   signal so a cross-device pull cannot lose progress (last-write-wins).
 */
export function applyManualAdd(
  existing: VocabEntry | undefined,
  input: ManualAddInput,
  now: number,
): VocabEntry {
  // A previously deleted word is treated as never-seen (mirror registerLookup).
  if (existing && existing.deleted_at != null) existing = undefined;

  if (!existing) {
    return {
      user_id: input.user_id,
      term: input.term,
      term_lang: input.term_lang,
      native_lang: input.native_lang,
      meaning: input.meaning,
      reading: input.reading,
      pos: input.pos,
      example: input.example,
      // External (Yomitan) definition: mark custom so it always displays as-is
      // instead of waiting for a matching gioitu dictionary entry.
      is_custom: true,
      lookup_count: 1,
      last_lookup_at: now,
      deleted_at: null,
      created_at: now,
      updated_at: now,
      ...newCard(now),
    };
  }

  const entry: VocabEntry = { ...existing };
  entry.lookup_count += 1;
  entry.last_lookup_at = now;
  entry.updated_at = now;
  if (input.meaning) {
    entry.meaning = input.meaning;
    entry.is_custom = true;
  }
  if (input.reading) entry.reading = input.reading;
  if (input.pos) entry.pos = input.pos;
  if (input.example) entry.example = input.example;
  if (entry.card_state == null) Object.assign(entry, newCard(now));
  return entry;
}
