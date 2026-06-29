// Server-side dictionary client (SPEC 2.A fallback). Best-effort and public:
// callers must tolerate the backend being absent (offline / static deploy) and
// fall back to IndexedDB, so every call resolves to null/[] instead of throwing.
//
// Server giờ trả DictionaryEntry phong phú (kế thừa jisho). Ở đây ta hạ về
// DictEntry — kiểu UI hiện tại đang dùng — để không phải đổi UI ở pha này. Các
// trường jisho chưa hiển thị (pitch/Hán-Việt/ảnh/bình luận) tạm bỏ qua; sẽ render
// ở pha UI sau.

import { DictEntry } from "@/shared/db";
import { DictionaryEntry, Gloss, Heading } from "@/shared/dictionary";
import { Sense } from "@/shared/structured-content";
import { resolveTags } from "../domain/tags";

const BASE = "/api";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const glossText = (g: Gloss): string => (typeof g === "string" ? g : g.text);

/** Mazii `kind` đôi khi gộp nhiều mã ("v1, vt") — tách thành từng chip. */
const splitPos = (codes: string[]): string[] =>
  [...new Set(codes.flatMap((c) => c.split(/[,\s/]+/).map((t) => t.trim()).filter(Boolean)))];

/** Hạ DictionaryEntry (đã-ráp, jisho) về DictEntry mà UI dùng, GIỮ phần phong phú. */
function toDictEntry(e: DictionaryEntry): DictEntry {
  const head: Heading = e.headings[0] ?? { base: "" };
  const senses: Sense[] = e.senses.map((s) => ({
    tags: splitPos(s.pos),
    // Giữ structured content (Yomitan) khi có để render giàu; nếu không, dùng gloss text.
    glossary: s.glossary && s.glossary.length ? s.glossary : s.gloss.map(glossText),
    dictionary: s.dictionary,
    examples: s.examples,
  }));
  const posCodes = [...new Set(senses.flatMap((s) => s.tags))];
  return {
    term: head.base,
    reading: head.reading,
    definitions: e.senses.flatMap((s) => s.gloss.map(glossText)),
    term_lang: e.term_lang,
    native_lang: e.native_lang,
    senses,
    tagMeta: resolveTags(posCodes),
    score: e.score,
    dictionary: e.senses.find((s) => s.dictionary)?.dictionary,
    // Trường phong phú kiểu jisho — UI render khi có.
    hanViet: head.hanViet,
    jlpt: head.jlpt,
    pitch: e.pitch,
    images: e.images,
    comments: e.comments,
  };
}

/** Server-side forward lookup (fallback when IndexedDB has no dictionary). */
export async function serverLookup(
  term: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry | null> {
  const q = `term=${encodeURIComponent(term)}&src=${term_lang}&tgt=${native_lang}`;
  const entry = await getJson<DictionaryEntry>(`/dict/lookup?${q}`);
  return entry ? toDictEntry(entry) : null;
}

export async function serverSuggest(
  prefix: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry[]> {
  const q = `prefix=${encodeURIComponent(prefix)}&src=${term_lang}&tgt=${native_lang}`;
  const entries = (await getJson<DictionaryEntry[]>(`/dict/suggest?${q}`)) ?? [];
  return entries.map(toDictEntry);
}

/** Server-side fuzzy near-misses (trigram), closest-first. */
export async function serverFuzzy(
  term: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry[]> {
  const q = `term=${encodeURIComponent(term)}&src=${term_lang}&tgt=${native_lang}`;
  const entries = (await getJson<DictionaryEntry[]>(`/dict/fuzzy?${q}`)) ?? [];
  return entries.map(toDictEntry);
}
