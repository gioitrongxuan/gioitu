// Ráp DictionaryEntry (đã-ráp, ≈ jisho Word.Entry) từ các dòng đọc được ở DB:
// word (headings/pitch) + entry[] (senses theo nguồn) + word_image[] + word_comment[].
// Thuần (nhận object thường, không chạm DB) → test được không cần Postgres.

import type { DictionaryEntry, Heading, Sense, PitchAccent } from "@/shared/dictionary";

// pg trả BIGINT dưới dạng chuỗi → id/word_id/created_at để string; cột JSONB đã được parse sẵn.
export interface WordRow {
  id: string;
  term_lang: string;
  native_lang: string;
  headings: Heading[];
  pitch: PitchAccent[] | null;
  freq_rank: number | null;
  jlpt: number | null;
  score: number;
  verified: boolean;
}
export interface EntryRow {
  word_id: string;
  senses: Sense[];
  dict_id: string | null;
  score: number;
}
export interface ImageRow {
  word_id: string;
  url: string;
  source: string | null;
}
export interface CommentRow {
  word_id: string;
  mean: string;
  likes: number;
  dislikes: number;
  author: string | null;
  avatar: string | null;
  source: string | null;
  created_at: string | null;
}

export function assembleEntry(
  word: WordRow,
  entries: EntryRow[],
  images: ImageRow[] = [],
  comments: CommentRow[] = [],
): DictionaryEntry {
  return {
    word_id: word.id,
    term_lang: word.term_lang,
    native_lang: word.native_lang,
    headings: word.headings ?? [],
    // Gộp senses từ mọi nguồn; mỗi sense tự mang `dictionary` (gắn lúc import).
    senses: entries.flatMap((e) => e.senses ?? []),
    pitch: word.pitch ?? undefined,
    images: images.length ? images.map((i) => ({ url: i.url, source: i.source ?? undefined })) : undefined,
    comments: comments.length
      ? comments.map((c) => ({
          mean: c.mean,
          likes: c.likes,
          dislikes: c.dislikes,
          author: c.author ?? undefined,
          avatar: c.avatar ?? undefined,
          source: c.source ?? undefined,
          createdAt: c.created_at != null ? Number(c.created_at) : undefined,
        }))
      : undefined,
    score: word.score ?? 0,
    verified: word.verified === true,
  };
}

/** Nhóm các dòng con theo word_id (giữ thứ tự xuất hiện). */
export function groupByWordId<T extends { word_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.word_id);
    if (list) list.push(r);
    else map.set(r.word_id, [r]);
  }
  return map;
}
