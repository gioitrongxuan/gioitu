// Dictionary data-access (SQL) trên schema mới: word + heading_lookup + entry +
// word_image + word_comment (kế thừa jisho). Trả về DictionaryEntry đã-ráp; giữ
// các route mỏng. Tra cứu qua bản chiếu heading_lookup; fuzzy dùng pg_trgm.

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../core/db.js";
import { parseYomitanZip, parseYomitanDir, extractGlossLines, ParsedDictionary } from "./yomitan.js";
import {
  assembleEntry,
  groupByWordId,
  WordRow,
  EntryRow,
  ImageRow,
  CommentRow,
} from "./assemble.js";
import type { DictionaryEntry, Sense } from "@/shared/dictionary";
import type { GlossaryNode } from "@/shared/structured-content";

export interface ImportSummary {
  dict_id: string;
  title: string;
  termCount: number;
  term_lang: string;
  native_lang: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Ráp entry từ word_id (gộp lô để tránh N+1)
// ─────────────────────────────────────────────────────────────────────────

/** Ráp các DictionaryEntry cho danh sách word_id, giữ đúng thứ tự `ids`. */
async function assembleByIds(ids: string[]): Promise<DictionaryEntry[]> {
  if (ids.length === 0) return [];

  const [words, entries, images, comments] = await Promise.all([
    pool.query<WordRow>(
      `SELECT id, term_lang, native_lang, headings, pitch, freq_rank, jlpt, score
         FROM word WHERE id = ANY($1)`,
      [ids],
    ),
    pool.query<EntryRow>(
      `SELECT word_id, senses, dict_id, score FROM entry
        WHERE word_id = ANY($1) ORDER BY score DESC, id`,
      [ids],
    ),
    pool.query<ImageRow>(
      `SELECT word_id, url, source FROM word_image WHERE word_id = ANY($1) ORDER BY ord, id`,
      [ids],
    ),
    pool.query<CommentRow>(
      `SELECT word_id, mean, likes, dislikes, author, avatar, source, created_at
         FROM word_comment WHERE word_id = ANY($1) ORDER BY likes DESC, id`,
      [ids],
    ),
  ]);

  const wordById = new Map(words.rows.map((w) => [w.id, w]));
  const entriesByWord = groupByWordId(entries.rows);
  const imagesByWord = groupByWordId(images.rows);
  const commentsByWord = groupByWordId(comments.rows);

  const out: DictionaryEntry[] = [];
  for (const id of ids) {
    const word = wordById.get(id);
    if (!word) continue;
    out.push(
      assembleEntry(
        word,
        entriesByWord.get(id) ?? [],
        imagesByWord.get(id) ?? [],
        commentsByWord.get(id) ?? [],
      ),
    );
  }
  return out;
}

/** word_id của các dòng heading, đã loại trùng, giữ thứ tự đầu vào. */
function distinctWordIds(rows: { word_id: string }[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of rows) {
    if (seen.has(r.word_id)) continue;
    seen.add(r.word_id);
    ids.push(r.word_id);
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────
// Tra cứu công khai
// ─────────────────────────────────────────────────────────────────────────

/**
 * Tra xuôi theo cặp ngôn ngữ. Khớp cả cách viết (base) lẫn âm đọc (reading) —
 * gõ reading vẫn ra entry dưới cách viết kanji — và ưu tiên khớp base.
 */
export async function lookup(term: string, src: string, tgt: string): Promise<DictionaryEntry | null> {
  const { rows } = await pool.query<{ word_id: string }>(
    `SELECT word_id FROM heading_lookup
      WHERE term_lang = $1 AND native_lang = $2 AND (base = $3 OR reading = $3)
      ORDER BY (base = $3) DESC LIMIT 1`,
    [src, tgt, term],
  );
  if (!rows[0]) return null;
  const [entry] = await assembleByIds([rows[0].word_id]);
  return entry ?? null;
}

/** Gợi ý theo tiền tố cách viết. */
export async function suggest(prefix: string, src: string, tgt: string): Promise<DictionaryEntry[]> {
  const { rows } = await pool.query<{ word_id: string }>(
    `SELECT word_id FROM heading_lookup
      WHERE term_lang = $1 AND native_lang = $2 AND base >= $3 AND base < $4
      ORDER BY base LIMIT 10`,
    [src, tgt, prefix, prefix + "￿"],
  );
  return assembleByIds(distinctWordIds(rows));
}

/**
 * Near-miss bằng trigram (pg_trgm) trên base và reading — thay levenshtein, dùng
 * được GIN index ở quy mô lớn. Sắp theo độ tương tự giảm dần, closest-first.
 */
export async function fuzzy(term: string, src: string, tgt: string, limit = 8): Promise<DictionaryEntry[]> {
  const { rows } = await pool.query<{ word_id: string }>(
    `SELECT word_id,
            GREATEST(similarity(base, $3), CASE WHEN reading <> '' THEN similarity(reading, $3) ELSE 0 END) AS sim
       FROM heading_lookup
      WHERE term_lang = $1 AND native_lang = $2
        AND (base % $3 OR (reading <> '' AND reading % $3))
      ORDER BY sim DESC, base
      LIMIT $4`,
    [src, tgt, term, limit],
  );
  return assembleByIds(distinctWordIds(rows));
}

// ─────────────────────────────────────────────────────────────────────────
// Ghi: import, seed dùng chung helper dedup theo heading
// ─────────────────────────────────────────────────────────────────────────

/** Tìm word theo (cặp, base, reading); chưa có thì tạo word + heading_lookup. */
async function resolveOrCreateWord(
  client: PoolClient,
  term_lang: string,
  native_lang: string,
  base: string,
  reading: string,
): Promise<string> {
  const found = await client.query<{ word_id: string }>(
    `SELECT word_id FROM heading_lookup
      WHERE term_lang = $1 AND native_lang = $2 AND base = $3 AND reading = $4`,
    [term_lang, native_lang, base, reading],
  );
  if (found.rows[0]) return found.rows[0].word_id;

  // Furigana không lưu ở đây — client tự dựng ruby lúc render (distributeFurigana).
  const heading: Record<string, string> = { base };
  if (reading) heading.reading = reading;
  const ins = await client.query<{ id: string }>(
    `INSERT INTO word (term_lang, native_lang, headings) VALUES ($1, $2, $3) RETURNING id`,
    [term_lang, native_lang, JSON.stringify([heading])],
  );
  const wordId = ins.rows[0].id;
  await client.query(
    `INSERT INTO heading_lookup (term_lang, native_lang, base, reading, word_id)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
    [term_lang, native_lang, base, reading, wordId],
  );
  return wordId;
}

/** Một sense đơn giản từ danh sách nghĩa text (Yomitan/thủ công/seed). */
function plainSense(definitions: string[], dictionary?: string): Sense {
  return { pos: [], gloss: definitions, ...(dictionary ? { dictionary } : {}) };
}

/** Gắn senses của một nguồn vào một word (1 dòng entry / nguồn). */
async function putEntry(
  client: PoolClient,
  wordId: string,
  dictId: string | null,
  senses: Sense[],
): Promise<void> {
  if (dictId === null) {
    // dict_id NULL không kích hoạt UNIQUE(word_id,dict_id); ép ≤1 nghĩa thủ công/từ thủ công.
    await client.query(`DELETE FROM entry WHERE word_id = $1 AND dict_id IS NULL`, [wordId]);
    await client.query(`INSERT INTO entry (word_id, dict_id, senses) VALUES ($1, NULL, $2)`, [
      wordId,
      JSON.stringify(senses),
    ]);
    return;
  }
  await client.query(
    `INSERT INTO entry (word_id, dict_id, senses) VALUES ($1, $2, $3)
     ON CONFLICT (word_id, dict_id) DO UPDATE SET senses = EXCLUDED.senses`,
    [wordId, dictId, JSON.stringify(senses)],
  );
}

/** Nạp một từ điển Yomitan đã parse — GIỮ structured content + POS theo từng sense. */
async function importParsed(parsed: ParsedDictionary): Promise<ImportSummary> {
  if (parsed.entries.length === 0) throw new Error("Không tìm thấy từ nào trong file");

  const dictId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO dictionaries (id, title, term_lang, native_lang, source, created_at)
       VALUES ($1, $2, $3, $4, 'yomitan', $5)`,
      [dictId, parsed.title, parsed.term_lang, parsed.native_lang, Date.now()],
    );
    for (const e of parsed.entries) {
      const wordId = await resolveOrCreateWord(client, parsed.term_lang, parsed.native_lang, e.term, e.reading ?? "");
      // Mỗi sense: POS = definitionTags; gloss = bản phẳng; glossary = node gốc (render giàu).
      const senses: Sense[] = e.senses.map((ps) => ({
        pos: ps.tags as Sense["pos"],
        gloss: extractGlossLines(ps.glossary),
        glossary: ps.glossary as GlossaryNode[],
        dictionary: parsed.title,
      }));
      await putEntry(client, wordId, dictId, senses.length ? senses : [plainSense(e.definitions, parsed.title)]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    dict_id: dictId,
    title: parsed.title,
    termCount: parsed.entries.length,
    term_lang: parsed.term_lang,
    native_lang: parsed.native_lang,
  };
}

/** Parse một archive .zip Yomitan và nạp thành một từ điển mới. */
export async function importBuffer(
  buf: Buffer,
  opts: { term_lang?: string; native_lang?: string },
): Promise<ImportSummary> {
  return importParsed(await parseYomitanZip(buf, opts));
}

/** Nạp một từ điển Yomitan từ thư mục đã giải nén (vd JMdict_english). */
export async function importYomitanDir(
  dir: string,
  opts: { term_lang?: string; native_lang?: string } = {},
): Promise<ImportSummary> {
  return importParsed(await parseYomitanDir(dir, opts));
}

/** Liệt kê từ điển đã nhập kèm số từ (số entry trỏ vào nó). */
export async function listDictionaries() {
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.term_lang, d.native_lang, d.created_at,
            COUNT(e.id)::int AS term_count
       FROM dictionaries d
       LEFT JOIN entry e ON e.dict_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at DESC`,
  );
  return rows;
}

/** Xoá một từ điển + entry của nó (cascade), rồi dọn word mồ côi. */
export async function deleteDictionary(id: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const del = await client.query("DELETE FROM dictionaries WHERE id = $1", [id]); // cascade entry
    await client.query(
      `DELETE FROM word w WHERE NOT EXISTS (SELECT 1 FROM entry e WHERE e.word_id = w.id)`,
    );
    await client.query("COMMIT");
    return Boolean(del.rowCount);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Quản trị: duyệt / thêm-sửa / xoá từ (giữ hợp đồng I/O cũ cho DictionaryManager)
// ─────────────────────────────────────────────────────────────────────────

/** Làm phẳng gloss của mọi sense về danh sách chuỗi (cho hợp đồng cũ). */
function definitionsOf(entry: DictionaryEntry): string[] {
  const out: string[] = [];
  for (const s of entry.senses) for (const g of s.gloss) out.push(typeof g === "string" ? g : g.text);
  return out;
}

/** Duyệt / tìm theo tiền tố trong một cặp ngôn ngữ (phân trang). */
export async function browseTerms(src: string, tgt: string, q: string, limit: number, offset: number) {
  const like = q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const hasQ = q.length > 0;
  const where = `h.term_lang = $1 AND h.native_lang = $2${hasQ ? " AND h.base ILIKE $3" : ""}`;
  const params: unknown[] = hasQ ? [src, tgt, like] : [src, tgt];

  const total = await pool.query<{ c: string }>(
    `SELECT COUNT(DISTINCT h.word_id) AS c FROM heading_lookup h WHERE ${where}`,
    params,
  );
  const page = await pool.query<{ word_id: string }>(
    `SELECT DISTINCT h.word_id, MIN(h.base) AS base FROM heading_lookup h
      WHERE ${where}
      GROUP BY h.word_id
      ORDER BY base LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const ids = distinctWordIds(page.rows);
  const entries = await assembleByIds(ids);

  const dictIds = await pool.query<{ word_id: string; dict_id: string | null }>(
    `SELECT DISTINCT ON (word_id) word_id, dict_id FROM entry WHERE word_id = ANY($1) ORDER BY word_id, id`,
    [ids],
  );
  const dictByWord = new Map(dictIds.rows.map((r) => [r.word_id, r.dict_id]));

  const items = ids.map((id, i) => {
    const e = entries[i];
    const h = e.headings[0];
    return {
      term: h?.base ?? "",
      reading: h?.reading,
      definitions: definitionsOf(e),
      term_lang: e.term_lang,
      native_lang: e.native_lang,
      dict_id: dictByWord.get(id) ?? null,
    };
  });
  return { total: Number(total.rows[0].c), items };
}

/** Thêm/sửa nghĩa thủ công của một từ (entry dict_id = NULL). */
export async function upsertTerm(entry: {
  term: string;
  term_lang: string;
  native_lang: string;
  reading: string | null;
  definitions: string[];
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const wordId = await resolveOrCreateWord(
      client,
      entry.term_lang,
      entry.native_lang,
      entry.term,
      entry.reading ?? "",
    );
    await putEntry(client, wordId, null, [plainSense(entry.definitions)]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Xoá một từ (word + entry/heading cascade). Trả false nếu không có. */
export async function deleteTerm(term: string, src: string, tgt: string): Promise<boolean> {
  const del = await pool.query(
    `DELETE FROM word WHERE id IN (
       SELECT word_id FROM heading_lookup WHERE term_lang = $1 AND native_lang = $2 AND base = $3
     )`,
    [src, tgt, term],
  );
  return Boolean(del.rowCount);
}
