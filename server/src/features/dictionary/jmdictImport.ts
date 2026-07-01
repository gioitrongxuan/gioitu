// Nhập một từ điển Yomitan LỚN (JMdict_english ~319k entry) theo lối set-based —
// giống maziiImport, khác với đường per-row `importYomitanDir` ở dictStore (chỉ hợp
// cho từ điển nhỏ do admin upload). Parse in-memory (parseYomitanDir) → bảng STAGING
// tạm → INSERT set-based word/heading_lookup/entry.
//
// JMdict_english là cặp NGÔN NGỮ MỚI (ja→en) nên KHÔNG đụng dữ liệu Mazii (ja→vi):
// mỗi (base,reading) tạo word (ja,en) riêng. Ta BẮT score Yomitan (row[4] = tần
// suất) vào word.score/entry.score để xếp hạng; rồi LAN score sang các word (ja,*)
// khác trùng base+reading — tần suất là thuộc tính của TỪ tiếng Nhật, không phụ
// thuộc ngôn ngữ đích — nhờ đó từ Mazii (score=0) cũng có tần suất để xếp ví dụ.

import { randomUUID } from "node:crypto";
import { pool } from "../../core/db.js";
import { bulkInsert } from "./bulkInsert.js";
import { parseYomitanDir, extractGlossLines, ParsedDictionary } from "./yomitan.js";
import type { ImportSummary } from "./dictStore.js";
import type { Sense } from "@/shared/dictionary";
import type { GlossaryNode } from "@/shared/structured-content";

const FLUSH_EVERY = 5000; // số entry giữa các lần flush staging

/** Ráp Sense[] (POS + gloss phẳng + structured content) từ một entry đã parse. */
function sensesOf(parsed: ParsedDictionary, e: ParsedDictionary["entries"][number]): Sense[] {
  return e.senses.map((ps) => ({
    pos: ps.tags as Sense["pos"],
    gloss: extractGlossLines(ps.glossary),
    glossary: ps.glossary as GlossaryNode[],
    dictionary: parsed.title,
  }));
}

/**
 * Lan score (tần suất) sang mọi cặp cùng ngôn ngữ NGUỒN: với mỗi (base,reading),
 * lấy MAX score qua tất cả word (src,*) rồi nâng các word còn thấp hơn lên. Idempotent
 * (chỉ nâng khi thấp hơn). Tách riêng để chạy độc lập được (vd sau khi nhập JMdict lên prod).
 *
 * Vật chất hoá bảng tần suất + ANALYZE để planner HASH-JOIN: join theo (base,reading)
 * không có index tổ hợp trên heading_lookup, nếu để subquery lồng thì planner dễ chọn
 * nested-loop (quét lại toàn bảng cho mỗi nhóm) → treo ở quy mô ~300k×500k dòng.
 */
export async function propagateFrequencyScores(srcLang: string): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `CREATE TEMP TABLE freq ON COMMIT DROP AS
         SELECT h.base, h.reading, MAX(w.score) AS score
           FROM heading_lookup h JOIN word w ON w.id = h.word_id
          WHERE h.term_lang = $1 AND w.score <> 0
          GROUP BY h.base, h.reading`,
      [srcLang],
    );
    await client.query(`CREATE INDEX ON freq (base, reading); ANALYZE freq;`);
    const res = await client.query(
      `UPDATE word tw SET score = f.score
         FROM freq f
         JOIN heading_lookup th
           ON th.term_lang = $1 AND th.base = f.base AND th.reading = f.reading
        WHERE tw.id = th.word_id AND tw.score < f.score`,
      [srcLang],
    );
    await client.query("COMMIT");
    return res.rowCount ?? 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Nhập một ParsedDictionary lớn theo lối set-based. Trả về ImportSummary + số dòng lan score. */
export async function importYomitanBulk(
  parsed: ParsedDictionary,
): Promise<ImportSummary & { propagated: number }> {
  if (parsed.entries.length === 0) throw new Error("Không tìm thấy từ nào trong file");

  const dictId = randomUUID();
  const src = parsed.term_lang;
  const tgt = parsed.native_lang;
  const client = await pool.connect();

  const buf: unknown[][] = [];
  let staged = 0;
  const flush = async () => {
    if (!buf.length) return;
    await bulkInsert(client, "stg_ydict", ["base", "reading", "score", "senses"], buf, 4000);
    staged += buf.length;
    buf.length = 0;
  };

  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO dictionaries (id, title, revision, term_lang, native_lang, source, created_at)
       VALUES ($1, $2, $3, $4, $5, 'yomitan', $6)`,
      [dictId, parsed.title, parsed.revision ?? null, src, tgt, Date.now()],
    );

    await client.query(
      `CREATE TEMP TABLE stg_ydict (base text, reading text, score int, senses jsonb) ON COMMIT DROP;`,
    );

    for (const e of parsed.entries) {
      const senses = sensesOf(parsed, e);
      if (!senses.length) continue;
      buf.push([e.term, e.reading ?? "", e.score, JSON.stringify(senses)]);
      if (buf.length >= FLUSH_EVERY) await flush();
    }
    await flush();

    await client.query(`CREATE INDEX ON stg_ydict (base, reading); ANALYZE stg_ydict;`);

    // 1) word mới (dedup theo heading chưa tồn tại), kèm score.
    await client.query(
      `INSERT INTO word (term_lang, native_lang, headings, score)
       SELECT $1, $2,
         jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
           'base', s.base, 'reading', NULLIF(s.reading, '')))),
         s.score
       FROM (SELECT DISTINCT ON (base, reading) base, reading, score
               FROM stg_ydict ORDER BY base, reading, score DESC) s
       WHERE NOT EXISTS (
         SELECT 1 FROM heading_lookup h
          WHERE h.term_lang = $1 AND h.native_lang = $2 AND h.base = s.base AND h.reading = s.reading)`,
      [src, tgt],
    );

    // 2) heading_lookup cho các word vừa tạo (mỗi word 1 heading: headings[0]).
    await client.query(
      `INSERT INTO heading_lookup (term_lang, native_lang, base, reading, word_id)
       SELECT $1, $2, w.headings->0->>'base', COALESCE(w.headings->0->>'reading', ''), w.id
         FROM word w
        WHERE w.term_lang = $1 AND w.native_lang = $2
          AND NOT EXISTS (SELECT 1 FROM heading_lookup h WHERE h.word_id = w.id)
       ON CONFLICT DO NOTHING`,
      [src, tgt],
    );

    // 2b) nâng score cho word ĐÃ tồn tại (tái nhập / nguồn khác tạo trước) — lấy max.
    await client.query(
      `UPDATE word w SET score = s.score
         FROM (SELECT DISTINCT ON (base, reading) base, reading, score
                 FROM stg_ydict ORDER BY base, reading, score DESC) s
         JOIN heading_lookup h
           ON h.term_lang = $1 AND h.native_lang = $2 AND h.base = s.base AND h.reading = s.reading
        WHERE w.id = h.word_id AND w.score < s.score`,
      [src, tgt],
    );

    // 3) entry: 1 dòng / word cho từ điển này (mỗi (base,reading) là 1 entry đã parse).
    await client.query(
      `INSERT INTO entry (word_id, dict_id, senses, score)
       SELECT h.word_id, $3, s.senses, s.score
         FROM (SELECT DISTINCT ON (base, reading) base, reading, senses, score
                 FROM stg_ydict ORDER BY base, reading, score DESC) s
         JOIN heading_lookup h
           ON h.term_lang = $1 AND h.native_lang = $2 AND h.base = s.base AND h.reading = s.reading
       ON CONFLICT (word_id, dict_id) DO UPDATE SET senses = EXCLUDED.senses, score = EXCLUDED.score`,
      [src, tgt, dictId],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Lan tần suất sang các cặp cùng nguồn (ngoài giao dịch nhập — idempotent).
  const propagated = await propagateFrequencyScores(src);

  const et = await pool.query<{ c: string }>(`SELECT COUNT(*) AS c FROM entry WHERE dict_id = $1`, [dictId]);
  return {
    dict_id: dictId,
    title: parsed.title,
    termCount: Number(et.rows[0].c),
    term_lang: src,
    native_lang: tgt,
    propagated,
  };
}

/** Nhập JMdict_english (hoặc Yomitan dir lớn khác). Mặc định cặp ja→en. */
export async function importJmdictDir(
  dir: string,
  opts: { term_lang?: string; native_lang?: string } = {},
): Promise<ImportSummary & { propagated: number }> {
  const parsed = await parseYomitanDir(dir, {
    term_lang: opts.term_lang ?? "ja",
    native_lang: opts.native_lang ?? "en",
  });
  return importYomitanBulk(parsed);
}
