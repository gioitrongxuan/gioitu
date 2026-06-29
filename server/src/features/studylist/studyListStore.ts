// Study list data-access (SQL). Bộ sưu tập từ có tên của người dùng, song song
// với SRS. Mỗi từ trỏ tới word.id của từ điển (giải bằng heading_lookup từ
// term/reading client gửi lên — không cần lộ id ra wire). Pha này: list CÁ NHÂN
// (chỉ chủ sở hữu thao tác); chia sẻ/cộng tác để pha sau.

import { randomUUID } from "node:crypto";
import { pool } from "../../core/db.js";

// Giới hạn (kế thừa jisho) — ép ở tầng app.
const MAX_LISTS_PER_USER = 1000;
const MAX_WORDS_PER_LIST = 10000;

export interface StudyListSummary {
  id: string;
  name: string;
  isPublic: boolean;
  wordCount: number;
  createdAt: number;
  modifiedAt: number;
}
export interface StudyListWordView {
  wordId: string;
  base: string;
  reading?: string;
  furigana?: string;
  addedAt: number;
}
export interface StudyListDetail extends StudyListSummary {
  words: StudyListWordView[];
}

export type AddWordResult = "ok" | "no-list" | "no-word" | "full";

function rowToSummary(r: Record<string, unknown>): StudyListSummary {
  return {
    id: r.id as string,
    name: r.name as string,
    isPublic: r.is_public as boolean,
    wordCount: Number(r.word_count),
    createdAt: Number(r.created_at),
    modifiedAt: Number(r.modified_at),
  };
}

/** word_id khớp (base hoặc reading) trong một cặp ngôn ngữ; ưu tiên khớp base. */
async function resolveWordId(
  term: string,
  reading: string,
  term_lang: string,
  native_lang: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ word_id: string }>(
    `SELECT word_id FROM heading_lookup
      WHERE term_lang = $1 AND native_lang = $2 AND (base = $3 OR reading = $3 OR (reading = $4 AND base = $3))
      ORDER BY (base = $3) DESC LIMIT 1`,
    [term_lang, native_lang, term, reading],
  );
  return rows[0]?.word_id ?? null;
}

async function ownsList(listId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM study_list WHERE id = $1 AND creator_id = $2`,
    [listId, userId],
  );
  return rows.length > 0;
}

async function touch(listId: string): Promise<void> {
  await pool.query(
    `UPDATE study_list
        SET word_count = (SELECT COUNT(*) FROM study_list_word WHERE list_id = $1),
            modified_at = $2
      WHERE id = $1`,
    [listId, Date.now()],
  );
}

/** Tạo list mới cho người dùng. Ném lỗi nếu vượt giới hạn. */
export async function createList(userId: string, name: string): Promise<{ id: string }> {
  const count = await pool.query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM study_list WHERE creator_id = $1`,
    [userId],
  );
  if (Number(count.rows[0].c) >= MAX_LISTS_PER_USER) {
    throw new Error("Đã đạt số lượng danh sách tối đa");
  }
  const id = randomUUID();
  const now = Date.now();
  await pool.query(
    `INSERT INTO study_list (id, creator_id, name, created_at, modified_at)
     VALUES ($1, $2, $3, $4, $4)`,
    [id, userId, name, now],
  );
  return { id };
}

/** Các list của người dùng, mới sửa lên đầu. */
export async function listsForUser(userId: string): Promise<StudyListSummary[]> {
  const { rows } = await pool.query(
    `SELECT id, name, is_public, word_count, created_at, modified_at
       FROM study_list WHERE creator_id = $1 ORDER BY modified_at DESC`,
    [userId],
  );
  return rows.map(rowToSummary);
}

/** Chi tiết một list (kèm từ). Chủ sở hữu, hoặc list công khai. */
export async function getList(listId: string, userId: string): Promise<StudyListDetail | null> {
  const { rows } = await pool.query(
    `SELECT id, name, is_public, word_count, created_at, modified_at, creator_id
       FROM study_list WHERE id = $1`,
    [listId],
  );
  const list = rows[0];
  if (!list) return null;
  if (list.creator_id !== userId && !list.is_public) return null;

  const words = await pool.query<{ word_id: string; added_at: string; headings: { base: string; reading?: string; furigana?: string }[] }>(
    `SELECT slw.word_id, slw.added_at, w.headings
       FROM study_list_word slw JOIN word w ON w.id = slw.word_id
      WHERE slw.list_id = $1
      ORDER BY slw.ord NULLS LAST, slw.added_at`,
    [listId],
  );
  return {
    ...rowToSummary(list),
    words: words.rows.map((r) => {
      const h = r.headings?.[0];
      return { wordId: r.word_id, base: h?.base ?? "", reading: h?.reading, furigana: h?.furigana, addedAt: Number(r.added_at) };
    }),
  };
}

export async function renameList(listId: string, userId: string, name: string): Promise<boolean> {
  const r = await pool.query(
    `UPDATE study_list SET name = $3, modified_at = $4 WHERE id = $1 AND creator_id = $2`,
    [listId, userId, name, Date.now()],
  );
  return Boolean(r.rowCount);
}

export async function deleteList(listId: string, userId: string): Promise<boolean> {
  const r = await pool.query(`DELETE FROM study_list WHERE id = $1 AND creator_id = $2`, [listId, userId]);
  return Boolean(r.rowCount);
}

/** Thêm một từ (giải word_id từ term/reading) vào list. */
export async function addWord(
  listId: string,
  userId: string,
  word: { term: string; reading?: string; term_lang: string; native_lang: string },
): Promise<AddWordResult> {
  if (!(await ownsList(listId, userId))) return "no-list";
  const wordId = await resolveWordId(word.term, word.reading ?? "", word.term_lang, word.native_lang);
  if (!wordId) return "no-word";

  const count = await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM study_list_word WHERE list_id = $1`, [listId]);
  if (Number(count.rows[0].c) >= MAX_WORDS_PER_LIST) return "full";

  await pool.query(
    `INSERT INTO study_list_word (list_id, word_id, added_at) VALUES ($1, $2, $3)
     ON CONFLICT (list_id, word_id) DO NOTHING`,
    [listId, wordId, Date.now()],
  );
  await touch(listId);
  return "ok";
}

export async function removeWord(listId: string, userId: string, wordId: string): Promise<boolean> {
  if (!(await ownsList(listId, userId))) return false;
  const r = await pool.query(`DELETE FROM study_list_word WHERE list_id = $1 AND word_id = $2`, [listId, wordId]);
  await touch(listId);
  return Boolean(r.rowCount);
}

/** Các list của người dùng có chứa từ này (cờ "marked" ở trang chi tiết). */
export async function markedFor(
  userId: string,
  term: string,
  reading: string,
  term_lang: string,
  native_lang: string,
): Promise<{ id: string; name: string }[]> {
  const wordId = await resolveWordId(term, reading, term_lang, native_lang);
  if (!wordId) return [];
  const { rows } = await pool.query<{ id: string; name: string }>(
    `SELECT sl.id, sl.name FROM study_list sl
       JOIN study_list_word slw ON slw.list_id = sl.id
      WHERE sl.creator_id = $1 AND slw.word_id = $2
      ORDER BY sl.name`,
    [userId, wordId],
  );
  return rows;
}
