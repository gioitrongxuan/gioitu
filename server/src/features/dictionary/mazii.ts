// Mazii JSONL → mô hình canonical (thuần, không chạm DB → test được). Mỗi dòng là
// một record {word, search[], comments[], images[]}. Mỗi `search[]` (thường 1, đôi
// khi nhiều = đồng âm) thành một "word-unit" key theo (base, reading). Ảnh & bình
// luận gắn vào word-unit chính (search[0]).
//
// Quyết định: weight (ngữ nghĩa không rõ) KHÔNG map sang freq_rank; synsets HOÃN;
// opposite_word → sense.xref (antonym); comment chỉ lấy status=1. Furigana KHÔNG
// lưu lúc import — client tự dựng ruby lúc render (distributeFurigana).

import type { Sense, PitchAccent, ExampleSentence, CrossReference } from "@/shared/dictionary";

/** Tối đa số ảnh giữ cho mỗi từ (URL Mazii nhiều và dễ chết; cắt cho gọn). */
export const MAX_IMAGES_PER_WORD = 16;

// --- Shape Mazii (lỏng, chỉ field ta dùng) ---
interface MaziiMean {
  kind?: string | null;
  mean?: string;
  examples?: { content?: string; mean?: string; transcription?: string }[] | null;
}
interface MaziiPron {
  kana?: string;
  accent?: string;
  tokenizedKana?: { value?: string }[] | null;
}
interface MaziiSearch {
  word?: string;
  han?: string | null;
  level?: string | string[] | null;
  phonetic?: string | null;
  pronunciation?: MaziiPron[] | null;
  means?: MaziiMean[] | null;
  opposite_word?: string[] | null;
}
interface MaziiComment {
  mean?: string;
  like?: number;
  dislike?: number;
  username?: string | null;
  avatar?: string | null;
  reportId?: number | string;
  status?: number;
}
export interface MaziiRecord {
  word?: string;
  search?: MaziiSearch[] | null;
  comments?: MaziiComment[] | null;
  images?: string[] | null;
}

export interface StagedWord {
  base: string;
  reading: string;
  hanViet?: string;
  furigana?: string;
  jlpt?: number;
  pitch?: PitchAccent[];
  senses: Sense[];
}
export interface StagedImage {
  base: string;
  reading: string;
  url: string;
  ord: number;
}
export interface StagedComment {
  base: string;
  reading: string;
  mean: string;
  likes: number;
  dislikes: number;
  author?: string;
  avatar?: string;
  sourceId: string;
}
export interface MappedRecord {
  words: StagedWord[];
  images: StagedImage[];
  comments: StagedComment[];
}

/** "N3" | ["N3","N1"] | "N3,N1" → 3 (lấy mức đầu). undefined nếu không có. */
export function parseJlpt(level: string | string[] | null | undefined): number | undefined {
  if (!level) return undefined;
  const first = Array.isArray(level) ? level[0] : String(level).split(",")[0];
  const m = /N([1-5])/i.exec(first ?? "");
  return m ? Number(m[1]) : undefined;
}

function pitchOf(prons: MaziiPron[] | null | undefined): PitchAccent[] | undefined {
  const out: PitchAccent[] = [];
  for (const p of prons ?? []) {
    if (!p?.kana) continue;
    out.push({
      kana: p.kana,
      accent: p.accent ?? undefined,
      moras: (p.tokenizedKana ?? []).map((t) => t.value ?? "").filter(Boolean),
    });
  }
  return out.length ? out : undefined;
}

function sensesOf(s: MaziiSearch): Sense[] {
  const out: Sense[] = [];
  for (const m of s.means ?? []) {
    const mean = (m.mean ?? "").trim();
    if (!mean) continue;
    const examples: ExampleSentence[] = (m.examples ?? [])
      .filter((e) => e?.content && e?.mean)
      .map((e) => ({ ja: e.content!, vi: e.mean! }));
    out.push({
      pos: m.kind ? [m.kind as Sense["pos"][number]] : [],
      gloss: [mean],
      ...(examples.length ? { examples } : {}),
      dictionary: "Mazii",
    });
  }
  // Trái nghĩa → xref antonym trên sense đầu.
  const antonyms = (s.opposite_word ?? []).filter(Boolean);
  if (antonyms.length && out.length) {
    const xref: CrossReference[] = antonyms.map((base) => ({ base, type: "antonym" }));
    out[0] = { ...out[0], xref };
  }
  return out;
}

/** Map một record Mazii → các word-unit + ảnh + bình luận đã chuẩn hoá. */
export function mapMaziiRecord(rec: MaziiRecord): MappedRecord {
  const words: StagedWord[] = [];
  for (const s of rec.search ?? []) {
    const base = (s.word ?? rec.word ?? "").trim();
    if (!base) continue;
    const reading = (s.pronunciation?.[0]?.kana ?? s.phonetic ?? "").trim();
    const senses = sensesOf(s);
    if (senses.length === 0) continue;
    words.push({
      base,
      reading,
      hanViet: s.han ?? undefined,
      jlpt: parseJlpt(s.level),
      pitch: pitchOf(s.pronunciation),
      senses,
    });
  }
  if (words.length === 0) return { words: [], images: [], comments: [] };

  // Ảnh & bình luận gắn vào word-unit chính (search[0]).
  const primary = words[0];
  const images: StagedImage[] = (rec.images ?? [])
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .slice(0, MAX_IMAGES_PER_WORD)
    .map((url, ord) => ({ base: primary.base, reading: primary.reading, url, ord }));

  const comments: StagedComment[] = (rec.comments ?? [])
    .filter((c) => c.status === 1 && (c.mean ?? "").trim())
    .map((c) => ({
      base: primary.base,
      reading: primary.reading,
      mean: c.mean!.trim(),
      likes: c.like ?? 0,
      dislikes: c.dislike ?? 0,
      author: c.username ?? undefined,
      avatar: c.avatar ?? undefined,
      sourceId: String(c.reportId ?? ""),
    }))
    .filter((c) => c.sourceId);

  return { words, images, comments };
}

/** Parse một dòng JSONL → record, null nếu hỏng (importer bỏ qua, không nuốt lỗi cả file). */
export function parseMaziiLine(line: string): MaziiRecord | null {
  const t = line.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as MaziiRecord;
  } catch {
    return null;
  }
}
