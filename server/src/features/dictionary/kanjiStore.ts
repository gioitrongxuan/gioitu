// Tra cứu kanji (đọc bảng `kanji` → KanjiEntry) + từ ví dụ tính LIVE qua
// heading_lookup/word (không lưu — như thiết kế). Giữ route mỏng, SQL ở đây.

import { pool } from "../../core/db.js";
import { assembleKanji, KanjiRow } from "./kanjiAssemble.js";
import type { KanjiEntry, KanjiExampleWord } from "@/shared/kanji";

const COLS = `literal, term_lang, native_lang, jouyou, jinmeiyou, jlpt, rank_news,
  stroke_count, stroke_counts, meanings, readings, components, structural, han_viet, score`;

/** Các kanji (chữ Hán) duy nhất trong một chuỗi, giữ thứ tự xuất hiện. */
export function kanjiCharsOf(text: string): string[] {
  const seen = new Set<string>();
  for (const c of text) if (/\p{Script=Han}/u.test(c)) seen.add(c);
  return [...seen];
}

export async function lookupKanji(literal: string, src: string, tgt: string): Promise<KanjiEntry | null> {
  const { rows } = await pool.query<KanjiRow>(
    `SELECT ${COLS} FROM kanji WHERE term_lang = $1 AND native_lang = $2 AND literal = $3`,
    [src, tgt, literal],
  );
  return rows[0] ? assembleKanji(rows[0]) : null;
}

/** Nhiều kanji một lượt (cho phần phân tích chữ của một từ); giữ thứ tự `literals`. */
export async function lookupKanjiMany(literals: string[], src: string, tgt: string): Promise<KanjiEntry[]> {
  if (literals.length === 0) return [];
  const { rows } = await pool.query<KanjiRow>(
    `SELECT ${COLS} FROM kanji WHERE term_lang = $1 AND native_lang = $2 AND literal = ANY($3)`,
    [src, tgt, literals],
  );
  const byLiteral = new Map(rows.map((r) => [r.literal, assembleKanji(r)]));
  return literals.map((l) => byLiteral.get(l)).filter((e): e is KanjiEntry => e !== undefined);
}

interface ExampleRow {
  headings: { base: string; reading?: string; hanViet?: string }[] | null;
  senses: { gloss?: (string | { text?: string })[] }[] | null;
}

/** Gloss đầu tiên dạng chuỗi của một entry (gloss có thể là chuỗi hoặc {text}). */
export function firstGloss(senses: ExampleRow["senses"]): string | undefined {
  const g = senses?.[0]?.gloss?.[0];
  if (typeof g === "string") return g;
  if (g && typeof g === "object") return g.text;
  return undefined;
}

export function toExampleWord(row: ExampleRow): KanjiExampleWord {
  const h = row.headings?.[0] ?? { base: "" };
  return {
    base: h.base,
    reading: h.reading || undefined,
    hanViet: h.hanViet || undefined,
    sense: firstGloss(row.senses),
  };
}

/** Từ (≥2 ký tự) chứa kanji, sắp theo độ phổ biến. Tính live, không lưu. */
export async function exampleWords(
  literal: string,
  src: string,
  tgt: string,
  limit = 8,
): Promise<KanjiExampleWord[]> {
  const { rows } = await pool.query<ExampleRow>(
    `SELECT w.headings,
            (SELECT e.senses FROM entry e WHERE e.word_id = w.id ORDER BY e.score DESC, e.id LIMIT 1) AS senses
       FROM word w
      WHERE w.id IN (
        SELECT DISTINCT word_id FROM heading_lookup
         WHERE term_lang = $1 AND native_lang = $2
           AND position($3 IN base) > 0 AND char_length(base) > 1
      )
      -- Ưu tiên tần suất (score lan từ JMdict). Từ chưa có score (=0) xếp sau, khi
      -- đó từ NGẮN thường là từ cơ bản hơn nên ưu tiên tiếp.
      ORDER BY w.score DESC, char_length(w.headings->0->>'base') ASC, w.id
      LIMIT $4`,
    [src, tgt, literal, limit],
  );
  return rows.map(toExampleWord);
}
