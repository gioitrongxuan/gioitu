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
import type {
  DictionaryEntry,
  EditableComment,
  EditableImage,
  EditableSense,
  Heading,
  ImportedEntryEdit,
  JlptLevel,
  PitchAccent,
  Sense,
  TermEditState,
} from "@/shared/dictionary";
import type { GlossaryNode } from "@/shared/structured-content";
import {
  editableToSenses,
  patchPrimaryHeading,
  sensesToEditable,
  stampSenseSource,
} from "./termEdit.js";

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
      `SELECT id, term_lang, native_lang, headings, pitch, freq_rank, jlpt, score, verified
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
 * Tra xuôi theo cặp ngôn ngữ. Khớp cả cách viết (base) lẫn âm đọc (reading) và
 * trả về MỌI từ khớp — gõ một âm đọc phải ra tất cả đồng âm mang âm đó
 * (さくら → 桜 và 櫻), không chỉ một. Ưu tiên khớp base, rồi độ phổ biến (score)
 * giảm dần — như jisho và nguồn local; nếu chỉ lấy một dòng không xếp score thì
 * dễ trả nhầm cách viết hiếm (櫻) thay vì cách viết thường (桜).
 */
export async function lookupMany(term: string, src: string, tgt: string): Promise<DictionaryEntry[]> {
  const { rows } = await pool.query<{ word_id: string }>(
    `SELECT h.word_id FROM heading_lookup h JOIN word w ON w.id = h.word_id
      WHERE h.term_lang = $1 AND h.native_lang = $2 AND (h.base = $3 OR h.reading = $3)
      ORDER BY (h.base = $3) DESC, w.score DESC, h.word_id`,
    [src, tgt, term],
  );
  return assembleByIds(distinctWordIds(rows));
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

/**
 * Tra theo nghĩa (#172): tìm từ mà một dòng gloss — chứ không phải cách viết
 * hay âm đọc — chứa `query`. Vd gõ "đồng cảm" ở cặp ja→vi vẫn ra từ tiếng Nhật
 * có nghĩa chứa cụm đó. Quét toàn bộ gloss của cặp (chưa có chỉ mục cho văn bản
 * nghĩa, không như `base`/`reading` đã có GIN trgm) nên chỉ đáng gọi như một
 * lượt tra bổ trợ off-hot-path, giống `fuzzy` — xem `useLookup.ts`.
 *
 * Cả gloss_line lẫn query đều đưa qua NORMALIZE(...,NFC) + gộp khoảng trắng
 * trước khi so: dữ liệu cào từ Mazii lẫn dạng NFD lẫn NBSP giữa các từ — so
 * ILIKE thô sẽ trật dù hai chuỗi hiển thị giống hệt. Lớp `\s` của regex Postgres
 * KHÔNG khớp NBSP (khác JS) nên phải tự thay chr(160) → dấu cách trước khi gộp.
 */
export async function lookupByDefinition(
  query: string,
  src: string,
  tgt: string,
  limit = 8,
): Promise<DictionaryEntry[]> {
  const q = query.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!q) return [];
  const like = "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const { rows } = await pool.query<{ word_id: string }>(
    `SELECT w.id AS word_id
       FROM entry e
       JOIN word w ON w.id = e.word_id
       CROSS JOIN LATERAL jsonb_array_elements(e.senses) AS sense
       CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(sense->'gloss', '[]'::jsonb)) AS gloss_line
      WHERE w.term_lang = $1 AND w.native_lang = $2
        AND regexp_replace(replace(NORMALIZE(gloss_line, NFC), chr(160), ' '), '\s+', ' ', 'g') ILIKE $3
      GROUP BY w.id
      ORDER BY MAX(w.score) DESC
      LIMIT $4`,
    [src, tgt, like, limit],
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
      wordId: id,
      term: h?.base ?? "",
      reading: h?.reading,
      definitions: definitionsOf(e),
      term_lang: e.term_lang,
      native_lang: e.native_lang,
      verified: e.verified === true,
      dict_id: dictByWord.get(id) ?? null,
    };
  });
  return { total: Number(total.rows[0].c), items };
}

/**
 * Vá thuộc tính cấp từ (heading chính: reading/Hán-Việt/JLPT; cột pitch/jlpt) rồi
 * dựng lại bản chiếu tra cho từ này. Ghi headings luôn; chỉ đụng `pitch` khi được
 * cung cấp (đừng xoá pitch nhập từ Mazii ở các sửa không liên quan).
 */
async function applyWordAttributes(
  client: PoolClient,
  wordId: string,
  a: {
    term: string;
    reading: string;
    hanViet?: string;
    jlpt?: JlptLevel;
    pitch?: PitchAccent[];
    term_lang: string;
    native_lang: string;
  },
): Promise<void> {
  const cur = await client.query<{ headings: Heading[] }>(`SELECT headings FROM word WHERE id = $1`, [wordId]);
  const headings = patchPrimaryHeading(cur.rows[0]?.headings ?? [], {
    term: a.term,
    reading: a.reading || undefined,
    hanViet: a.hanViet,
    jlpt: a.jlpt,
  });

  if (a.pitch !== undefined) {
    await client.query(`UPDATE word SET headings = $2, jlpt = $3, pitch = $4 WHERE id = $1`, [
      wordId,
      JSON.stringify(headings),
      a.jlpt ?? null,
      a.pitch.length ? JSON.stringify(a.pitch) : null,
    ]);
  } else {
    await client.query(`UPDATE word SET headings = $2, jlpt = $3 WHERE id = $1`, [
      wordId,
      JSON.stringify(headings),
      a.jlpt ?? null,
    ]);
  }

  // Đồng bộ bản chiếu tra cho ĐÚNG cách viết đang sửa (đổi reading/Hán-Việt).
  // Chỉ đụng hàng có base = term để không xoá han_viet của các cách viết khác
  // (nguồn Mazii có thể chỉ lưu han_viet ở cột lookup, không ở headings JSONB).
  await client.query(`DELETE FROM heading_lookup WHERE word_id = $1 AND base = $2`, [wordId, a.term]);
  await client.query(
    `INSERT INTO heading_lookup (term_lang, native_lang, base, reading, word_id, han_viet)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [a.term_lang, a.native_lang, a.term, a.reading, wordId, a.hanViet ?? null],
  );
}

/**
 * Thêm/sửa lớp nghĩa THỦ CÔNG của một từ (entry dict_id = NULL) cùng thuộc tính
 * cấp từ (reading/Hán-Việt/JLPT/pitch). Khi có `word_id` thì sửa đúng từ đó (kể
 * cả đổi reading); không có thì tạo/khớp theo (cách viết, âm đọc).
 *
 * Senses rỗng chỉ hợp lệ với từ ĐÃ tồn tại: nghĩa là "xoá lớp thủ công, chỉ sửa
 * thuộc tính" — cần thiết để sửa cách đọc/Hán-Việt của từ nhập máy mà không phải
 * bịa thêm nghĩa tay. Nếu vì thế từ không còn nguồn nghĩa nào thì xoá luôn từ.
 */
export async function upsertTerm(entry: {
  word_id?: string;
  term: string;
  term_lang: string;
  native_lang: string;
  reading?: string | null;
  hanViet?: string;
  jlpt?: JlptLevel;
  pitch?: PitchAccent[];
  senses: EditableSense[];
}) {
  const reading = entry.reading ?? "";
  const senses = editableToSenses(entry.senses);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let wordId = entry.word_id;
    if (!wordId) {
      if (senses.length === 0) {
        const found = await client.query<{ word_id: string }>(
          `SELECT word_id FROM heading_lookup
            WHERE term_lang = $1 AND native_lang = $2 AND base = $3 AND reading = $4`,
          [entry.term_lang, entry.native_lang, entry.term, reading],
        );
        wordId = found.rows[0]?.word_id;
        if (!wordId) throw new Error("Cần ít nhất một nghĩa");
      } else {
        wordId = await resolveOrCreateWord(client, entry.term_lang, entry.native_lang, entry.term, reading);
      }
    }

    if (senses.length === 0) {
      await client.query(`DELETE FROM entry WHERE word_id = $1 AND dict_id IS NULL`, [wordId]);
      const rest = await client.query(`SELECT 1 FROM entry WHERE word_id = $1 LIMIT 1`, [wordId]);
      if (!rest.rows[0]) {
        await client.query(`DELETE FROM word WHERE id = $1`, [wordId]);
        await client.query("COMMIT");
        return;
      }
    } else {
      await putEntry(client, wordId, null, senses);
    }

    await applyWordAttributes(client, wordId, {
      term: entry.term,
      reading,
      hanViet: entry.hanViet,
      jlpt: entry.jlpt,
      pitch: entry.pitch,
      term_lang: entry.term_lang,
      native_lang: entry.native_lang,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Trạng thái để mở form sửa một từ: thuộc tính cấp từ + lớp nghĩa thủ công +
 * nghĩa của TỪNG nguồn đã nhập (sửa được, theo entry_id) + ảnh/bình luận (gỡ
 * được) + cờ kiểm duyệt. Null nếu không có từ.
 */
export async function getTermForEdit(
  src: string,
  tgt: string,
  term: string,
  reading: string,
): Promise<TermEditState | null> {
  const found = await pool.query<{ word_id: string }>(
    `SELECT word_id FROM heading_lookup
      WHERE term_lang = $1 AND native_lang = $2 AND base = $3 AND reading = $4`,
    [src, tgt, term, reading ?? ""],
  );
  if (!found.rows[0]) return null;
  const wordId = found.rows[0].word_id;

  const [wordRes, entryRes, imageRes, commentRes] = await Promise.all([
    pool.query<{ headings: Heading[]; pitch: PitchAccent[] | null; jlpt: number | null; verified: boolean }>(
      `SELECT headings, pitch, jlpt, verified FROM word WHERE id = $1`,
      [wordId],
    ),
    pool.query<{ id: string; senses: Sense[]; dict_id: string | null; title: string | null }>(
      `SELECT e.id, e.senses, e.dict_id, d.title FROM entry e
         LEFT JOIN dictionaries d ON d.id = e.dict_id
        WHERE e.word_id = $1 ORDER BY (e.dict_id IS NULL) DESC, e.id`,
      [wordId],
    ),
    pool.query<{ id: string; url: string; source: string | null }>(
      `SELECT id, url, source FROM word_image WHERE word_id = $1 ORDER BY ord, id`,
      [wordId],
    ),
    pool.query<{ id: string; mean: string; author: string | null }>(
      `SELECT id, mean, author FROM word_comment WHERE word_id = $1 ORDER BY likes DESC, id`,
      [wordId],
    ),
  ]);
  const word = wordRes.rows[0];
  const head = word?.headings?.find((h) => h.base === term) ?? word?.headings?.[0];
  const manual = entryRes.rows.find((e) => e.dict_id === null);
  const imported: ImportedEntryEdit[] = entryRes.rows
    .filter((e) => e.dict_id !== null)
    .map((e) => ({
      entry_id: e.id,
      // Tên nguồn: registry là nguồn sự thật; sense JSON là dấu vết lúc import.
      dictionary: e.title ?? e.senses?.find((s) => s.dictionary)?.dictionary,
      senses: sensesToEditable(e.senses ?? []),
    }));
  const images: EditableImage[] = imageRes.rows.map((i) => ({
    id: i.id,
    url: i.url,
    source: i.source ?? undefined,
  }));
  const comments: EditableComment[] = commentRes.rows.map((c) => ({
    id: c.id,
    mean: c.mean,
    author: c.author ?? undefined,
  }));

  return {
    word_id: wordId,
    term,
    term_lang: src,
    native_lang: tgt,
    reading: head?.reading,
    hanViet: head?.hanViet,
    jlpt: (head?.jlpt ?? word?.jlpt ?? undefined) as JlptLevel | undefined,
    pitch: word?.pitch ?? undefined,
    verified: word?.verified === true,
    senses: sensesToEditable(manual?.senses ?? []),
    imported,
    images,
    comments,
  };
}

/** Bật/tắt cờ kiểm duyệt của một từ. Trả false nếu word_id không tồn tại. */
export async function setTermVerified(wordId: string, verified: boolean): Promise<boolean> {
  const res = await pool.query(`UPDATE word SET verified = $2 WHERE id = $1`, [wordId, verified]);
  return Boolean(res.rowCount);
}

/**
 * Ghi đè nghĩa của MỘT nguồn đã nhập (một dòng entry). Senses rỗng = gỡ nguồn
 * đó khỏi từ; nếu từ không còn nguồn nghĩa nào thì xoá luôn word (đồng bộ với
 * cách deleteDictionary dọn word mồ côi). Sense sửa tay được đóng dấu lại tên
 * nguồn để UI vẫn hiện đúng xuất xứ.
 */
export async function updateEntrySenses(
  entryId: string,
  editable: EditableSense[],
): Promise<{ found: boolean; deleted: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query<{ word_id: string; dict_id: string | null; title: string | null }>(
      `SELECT e.word_id, e.dict_id, d.title FROM entry e
         LEFT JOIN dictionaries d ON d.id = e.dict_id
        WHERE e.id = $1`,
      [entryId],
    );
    const row = cur.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { found: false, deleted: false };
    }

    const senses = stampSenseSource(editableToSenses(editable), row.title ?? undefined);
    if (senses.length === 0) {
      await client.query(`DELETE FROM entry WHERE id = $1`, [entryId]);
      await client.query(
        `DELETE FROM word w WHERE w.id = $1
           AND NOT EXISTS (SELECT 1 FROM entry e WHERE e.word_id = w.id)`,
        [row.word_id],
      );
      await client.query("COMMIT");
      return { found: true, deleted: true };
    }

    await client.query(`UPDATE entry SET senses = $2 WHERE id = $1`, [entryId, JSON.stringify(senses)]);
    await client.query("COMMIT");
    return { found: true, deleted: false };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Thêm một ảnh minh hoạ (cuối gallery). Trùng URL thì trả về ảnh sẵn có. */
export async function addWordImage(wordId: string, url: string): Promise<EditableImage | null> {
  const ins = await pool.query<{ id: string; url: string; source: string | null }>(
    `INSERT INTO word_image (word_id, url, source, ord)
     SELECT $1, $2, 'admin', COALESCE(MAX(ord) + 1, 0) FROM word_image WHERE word_id = $1
     ON CONFLICT (word_id, url) DO NOTHING
     RETURNING id, url, source`,
    [wordId, url],
  );
  const row =
    ins.rows[0] ??
    (
      await pool.query<{ id: string; url: string; source: string | null }>(
        `SELECT id, url, source FROM word_image WHERE word_id = $1 AND url = $2`,
        [wordId, url],
      )
    ).rows[0];
  return row ? { id: row.id, url: row.url, source: row.source ?? undefined } : null;
}

/** Gỡ một ảnh minh hoạ theo id. Trả false nếu không có. */
export async function deleteWordImage(id: string): Promise<boolean> {
  const res = await pool.query(`DELETE FROM word_image WHERE id = $1`, [id]);
  return Boolean(res.rowCount);
}

/** Gỡ một bình luận theo id. Trả false nếu không có. */
export async function deleteWordComment(id: string): Promise<boolean> {
  const res = await pool.query(`DELETE FROM word_comment WHERE id = $1`, [id]);
  return Boolean(res.rowCount);
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
