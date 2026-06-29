// Nhập mazii.jsonl (≈169k dòng, 763MB) vào schema mới. Đọc STREAM theo dòng để
// không nạp cả file vào RAM; dồn vào bảng STAGING tạm rồi INSERT set-based (cách
// duy nhất đủ nhanh ở quy mô này — tránh hàng trăm nghìn round-trip per-row).
//
// Pipeline set-based sau khi staging xong:
//   1) tạo word mới (dedup theo (base,reading) chưa có trong heading_lookup)
//   2) thêm heading_lookup cho các word vừa tạo (lấy từ headings[0])
//   3) entry: gộp senses theo (base,reading) → 1 entry/word cho nguồn Mazii
//   4) word_image, 5) word_comment (join qua heading_lookup)

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../core/db.js";
import { parseMaziiLine, mapMaziiRecord, StagedWord, StagedImage, StagedComment } from "./mazii.js";

export interface MaziiImportSummary {
  dict_id: string;
  linesRead: number;
  wordsStaged: number;
  imagesStaged: number;
  commentsStaged: number;
  wordsTotal: number;
  entriesTotal: number;
}

const TERM_LANG = "ja";
const NATIVE_LANG = "vi";
const FLUSH_EVERY = 2000; // số dòng giữa các lần flush staging

/** INSERT nhiều dòng, chia mẻ để không vượt giới hạn tham số của Postgres. */
async function bulkInsert(
  client: PoolClient,
  table: string,
  cols: string[],
  rows: unknown[][],
  chunkRows: number,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkRows) {
    const slice = rows.slice(i, i + chunkRows);
    const params: unknown[] = [];
    const tuples = slice.map((r, j) => {
      const base = j * cols.length;
      params.push(...r);
      return "(" + cols.map((_, k) => "$" + (base + k + 1)).join(",") + ")";
    });
    await client.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${tuples.join(",")}`, params);
  }
}

/** Lấy (hoặc tạo) một dòng dictionaries cho Mazii — tái nhập không tạo trùng. */
async function ensureMaziiDictionary(client: PoolClient): Promise<string> {
  const found = await client.query<{ id: string }>(
    `SELECT id FROM dictionaries WHERE source = 'mazii' AND term_lang = $1 AND native_lang = $2 LIMIT 1`,
    [TERM_LANG, NATIVE_LANG],
  );
  if (found.rows[0]) return found.rows[0].id;
  const id = randomUUID();
  await client.query(
    `INSERT INTO dictionaries (id, title, term_lang, native_lang, source, created_at)
     VALUES ($1, 'Mazii JA-VI', $2, $3, 'mazii', $4)`,
    [id, TERM_LANG, NATIVE_LANG, Date.now()],
  );
  return id;
}

export async function importMaziiFile(
  filePath: string,
  opts: { maxLines?: number } = {},
): Promise<MaziiImportSummary> {
  const client = await pool.connect();
  let linesRead = 0;
  let wordsStaged = 0;
  let imagesStaged = 0;
  let commentsStaged = 0;

  const wordBuf: unknown[][] = [];
  const imgBuf: unknown[][] = [];
  const comBuf: unknown[][] = [];

  const pushWord = (w: StagedWord) => {
    wordBuf.push([
      w.base,
      w.reading,
      w.hanViet ?? null,
      w.furigana ?? null,
      w.jlpt ?? null,
      w.pitch ? JSON.stringify(w.pitch) : null,
      JSON.stringify(w.senses),
    ]);
  };
  const pushImg = (im: StagedImage) => imgBuf.push([im.base, im.reading, im.url, im.ord]);
  const pushCom = (c: StagedComment) =>
    comBuf.push([c.base, c.reading, c.mean, c.likes, c.dislikes, c.author ?? null, c.avatar ?? null, c.sourceId]);

  const flush = async () => {
    if (wordBuf.length) {
      await bulkInsert(client, "stg_word",
        ["base", "reading", "han_viet", "furigana", "jlpt", "pitch", "senses"], wordBuf, 5000);
      wordsStaged += wordBuf.length;
      wordBuf.length = 0;
    }
    if (imgBuf.length) {
      await bulkInsert(client, "stg_image", ["base", "reading", "url", "ord"], imgBuf, 10000);
      imagesStaged += imgBuf.length;
      imgBuf.length = 0;
    }
    if (comBuf.length) {
      await bulkInsert(client, "stg_comment",
        ["base", "reading", "mean", "likes", "dislikes", "author", "avatar", "source_id"], comBuf, 6000);
      commentsStaged += comBuf.length;
      comBuf.length = 0;
    }
  };

  try {
    await client.query("BEGIN");
    const dictId = await ensureMaziiDictionary(client);

    await client.query(`
      CREATE TEMP TABLE stg_word (base text, reading text, han_viet text, furigana text,
        jlpt smallint, pitch jsonb, senses jsonb) ON COMMIT DROP;
      CREATE TEMP TABLE stg_image (base text, reading text, url text, ord int) ON COMMIT DROP;
      CREATE TEMP TABLE stg_comment (base text, reading text, mean text, likes int, dislikes int,
        author text, avatar text, source_id text) ON COMMIT DROP;
    `);

    const rl = createInterface({ input: createReadStream(filePath, "utf8"), crlfDelay: Infinity });
    for await (const line of rl) {
      if (opts.maxLines && linesRead >= opts.maxLines) break;
      linesRead++;
      const rec = parseMaziiLine(line);
      if (!rec) continue;
      const mapped = mapMaziiRecord(rec);
      mapped.words.forEach(pushWord);
      mapped.images.forEach(pushImg);
      mapped.comments.forEach(pushCom);
      if (linesRead % FLUSH_EVERY === 0) await flush();
    }
    rl.close();
    await flush();

    // Index trên staging cho các phép join/aggregate set-based bên dưới.
    await client.query(`
      CREATE INDEX ON stg_word (base, reading);
      CREATE INDEX ON stg_image (base, reading);
      CREATE INDEX ON stg_comment (base, reading);
      ANALYZE stg_word; ANALYZE stg_image; ANALYZE stg_comment;
    `);

    // 1) word mới (dedup heading chưa tồn tại).
    await client.query(
      `INSERT INTO word (term_lang, native_lang, headings, pitch, jlpt)
       SELECT $1, $2,
         jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'base', s.base, 'reading', NULLIF(s.reading, ''),
           'hanViet', s.han_viet, 'furigana', s.furigana))),
         s.pitch, s.jlpt
       FROM (SELECT DISTINCT ON (base, reading) base, reading, han_viet, furigana, jlpt, pitch
               FROM stg_word ORDER BY base, reading) s
       WHERE NOT EXISTS (
         SELECT 1 FROM heading_lookup h
          WHERE h.term_lang = $1 AND h.native_lang = $2 AND h.base = s.base AND h.reading = s.reading)`,
      [TERM_LANG, NATIVE_LANG],
    );

    // 2) heading_lookup cho các word vừa tạo (lấy từ headings[0]).
    await client.query(
      `INSERT INTO heading_lookup (term_lang, native_lang, base, reading, word_id, han_viet)
       SELECT $1, $2, w.headings->0->>'base', COALESCE(w.headings->0->>'reading', ''), w.id,
              w.headings->0->>'hanViet'
         FROM word w
        WHERE w.term_lang = $1 AND w.native_lang = $2
          AND NOT EXISTS (SELECT 1 FROM heading_lookup h WHERE h.word_id = w.id)
       ON CONFLICT DO NOTHING`,
      [TERM_LANG, NATIVE_LANG],
    );

    // 3) entry Mazii: gộp senses theo (base, reading) → 1 entry/word.
    await client.query(
      `INSERT INTO entry (word_id, dict_id, senses)
       SELECT h.word_id, $3,
              (SELECT jsonb_agg(elem)
                 FROM stg_word s2 CROSS JOIN LATERAL jsonb_array_elements(s2.senses) elem
                WHERE s2.base = agg.base AND s2.reading = agg.reading)
         FROM (SELECT DISTINCT base, reading FROM stg_word) agg
         JOIN heading_lookup h
           ON h.term_lang = $1 AND h.native_lang = $2 AND h.base = agg.base AND h.reading = agg.reading
       ON CONFLICT (word_id, dict_id) DO UPDATE SET senses = EXCLUDED.senses`,
      [TERM_LANG, NATIVE_LANG, dictId],
    );

    // 4) ảnh, 5) bình luận.
    await client.query(
      `INSERT INTO word_image (word_id, url, source, ord)
       SELECT h.word_id, si.url, 'mazii', si.ord
         FROM stg_image si
         JOIN heading_lookup h
           ON h.term_lang = $1 AND h.native_lang = $2 AND h.base = si.base AND h.reading = si.reading
       ON CONFLICT (word_id, url) DO NOTHING`,
      [TERM_LANG, NATIVE_LANG],
    );
    await client.query(
      `INSERT INTO word_comment (word_id, mean, likes, dislikes, author, avatar, source, source_id)
       SELECT h.word_id, sc.mean, sc.likes, sc.dislikes, sc.author, sc.avatar, 'mazii', sc.source_id
         FROM stg_comment sc
         JOIN heading_lookup h
           ON h.term_lang = $1 AND h.native_lang = $2 AND h.base = sc.base AND h.reading = sc.reading
       ON CONFLICT (source, source_id) DO NOTHING`,
      [TERM_LANG, NATIVE_LANG],
    );

    await client.query("COMMIT");

    const wt = await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM word`);
    const et = await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM entry WHERE dict_id = $1`, [dictId]);

    return {
      dict_id: dictId,
      linesRead,
      wordsStaged,
      imagesStaged,
      commentsStaged,
      wordsTotal: Number(wt.rows[0].c),
      entriesTotal: Number(et.rows[0].c),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
