// Nhập KANJIDIC2 vào bảng `kanji`. Mỗi kanji tạo 1 dòng/cặp ngôn ngữ (PK
// term_lang,native_lang,literal): (ja,en) lấy nghĩa tiếng Anh KANJIDIC2; (ja,vi)
// lấy nghĩa + Hán-Việt từ Mazii (đã nhập sẵn ở word/heading_lookup/entry), fallback
// Hán-Việt = âm <reading vietnam> viết hoa. Phần cấu trúc (nét/on-kun/components…)
// giống nhau giữa các dòng. Dồn staging tạm rồi UPSERT set-based như importer Mazii.
//
// CHẠY SAU Mazii: bước enrich (ja,vi) đọc heading_lookup/entry của Mazii.

import * as fs from "node:fs/promises";
import type { PoolClient } from "pg";
import { pool } from "../../core/db.js";
import type { StoredStructural } from "@/shared/kanji";
import { iterateKanjidic, mapKanjidicEntry, toStoredReadings } from "./kanjidic.js";
import { loadKanjiData, attachStructure, DEFAULT_DATA_DIR, type KanjiData } from "./kanjiData.js";

const TERM_LANG = "ja";

export interface KanjidicImportSummary {
  charsParsed: number;
  kanjiTotal: number;
  viWithHanViet: number;
  viWithMeanings: number;
}

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

function structuralOf(entry: {
  structuralCategory?: StoredStructural["category"];
  keiseiPhonetic?: string[];
  keiseiSemantic?: string[];
}): StoredStructural | null {
  const s: StoredStructural = {};
  if (entry.structuralCategory) s.category = entry.structuralCategory;
  if (entry.keiseiPhonetic?.length) s.keiseiPhonetic = entry.keiseiPhonetic;
  if (entry.keiseiSemantic?.length) s.keiseiSemantic = entry.keiseiSemantic;
  return Object.keys(s).length ? s : null;
}

const STG_COLS = [
  "literal", "jouyou", "jinmeiyou", "jlpt", "rank_news", "stroke_count", "stroke_counts",
  "en_meanings", "readings", "components", "structural", "vietnam", "score",
];

/** Cột chung khi UPSERT vào `kanji` (chỉ phần cấu trúc — không gồm meanings/han_viet). */
const STRUCTURE_UPDATE = `
  jouyou=EXCLUDED.jouyou, jinmeiyou=EXCLUDED.jinmeiyou, jlpt=EXCLUDED.jlpt,
  rank_news=EXCLUDED.rank_news, stroke_count=EXCLUDED.stroke_count,
  stroke_counts=EXCLUDED.stroke_counts, readings=EXCLUDED.readings,
  components=EXCLUDED.components, structural=EXCLUDED.structural, score=EXCLUDED.score`;

export async function importKanjidicFile(
  xmlPath: string,
  opts: { dataDir?: string; data?: KanjiData } = {},
): Promise<KanjidicImportSummary> {
  const data = opts.data ?? loadKanjiData(opts.dataDir ?? DEFAULT_DATA_DIR);
  const xml = await fs.readFile(xmlPath, "utf8");

  const client = await pool.connect();
  let charsParsed = 0;
  const buf: unknown[][] = [];

  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TEMP TABLE stg_kanji (
        literal text, jouyou smallint, jinmeiyou boolean, jlpt smallint, rank_news int,
        stroke_count smallint, stroke_counts jsonb, en_meanings jsonb, readings jsonb,
        components jsonb, structural jsonb, vietnam jsonb, score int
      ) ON COMMIT DROP;
    `);

    for await (const raw of iterateKanjidic(xml)) {
      charsParsed++;
      const { entry, vietnamReadings } = mapKanjidicEntry(raw);
      attachStructure(entry, data);
      const structural = structuralOf(entry);
      buf.push([
        entry.literal,
        entry.jouyou ?? null,
        entry.jinmeiyou ?? null,
        entry.jlpt ?? null,
        entry.rankNews ?? null,
        entry.strokeCount,
        entry.strokeCounts ? JSON.stringify(entry.strokeCounts) : null,
        JSON.stringify(entry.meanings),
        JSON.stringify(toStoredReadings(entry)),
        JSON.stringify(entry.components),
        structural ? JSON.stringify(structural) : null,
        JSON.stringify(vietnamReadings),
        entry.score ?? null,
      ]);
    }
    await bulkInsert(client, "stg_kanji", STG_COLS, buf, 1000);

    // (ja,en): nghĩa tiếng Anh, không Hán-Việt.
    await client.query(`
      INSERT INTO kanji (literal, term_lang, native_lang, jouyou, jinmeiyou, jlpt, rank_news,
        stroke_count, stroke_counts, meanings, readings, components, structural, han_viet, score)
      SELECT literal, '${TERM_LANG}', 'en', jouyou, jinmeiyou, jlpt, rank_news, stroke_count,
        stroke_counts, en_meanings, readings, components, structural, NULL, score
      FROM stg_kanji
      ON CONFLICT (term_lang, native_lang, literal) DO UPDATE SET
        ${STRUCTURE_UPDATE}, meanings=EXCLUDED.meanings`);

    // (ja,vi): nghĩa để Mazii điền sau; Hán-Việt mặc định = fallback <reading vietnam>.
    await client.query(`
      INSERT INTO kanji (literal, term_lang, native_lang, jouyou, jinmeiyou, jlpt, rank_news,
        stroke_count, stroke_counts, meanings, readings, components, structural, han_viet, score)
      SELECT literal, '${TERM_LANG}', 'vi', jouyou, jinmeiyou, jlpt, rank_news, stroke_count,
        stroke_counts, '[]'::jsonb, readings, components, structural,
        CASE WHEN jsonb_array_length(vietnam) > 0 THEN vietnam END, score
      FROM stg_kanji
      ON CONFLICT (term_lang, native_lang, literal) DO UPDATE SET
        ${STRUCTURE_UPDATE}, meanings='[]'::jsonb,
        han_viet = CASE WHEN jsonb_array_length(EXCLUDED.han_viet) > 0 THEN EXCLUDED.han_viet END`);

    // Enrich (ja,vi) từ Mazii: nghĩa VI (gộp gloss của entry 1-kanji) + Hán-Việt (đè fallback).
    await client.query(`
      UPDATE kanji k SET
        meanings = COALESCE(m.glosses, k.meanings),
        han_viet = COALESCE(m.han_viet_arr, k.han_viet)
      FROM (
        SELECT hl.base AS literal,
          CASE WHEN hl.han_viet IS NOT NULL AND hl.han_viet <> ''
               THEN jsonb_build_array(hl.han_viet) END AS han_viet_arr,
          -- gộp gloss của entry 1-kanji; bỏ trùng nhưng GIỮ thứ tự xuất hiện (nghĩa chính trước).
          (SELECT jsonb_agg(gloss ORDER BY ord)
             FROM (
               SELECT gv AS gloss, MIN(so * 1000 + go) AS ord
                 FROM entry e
                 CROSS JOIN LATERAL jsonb_array_elements(e.senses) WITH ORDINALITY AS sx(sv, so)
                 CROSS JOIN LATERAL jsonb_array_elements(sx.sv->'gloss') WITH ORDINALITY AS gx(gv, go)
                WHERE e.word_id = hl.word_id AND jsonb_typeof(gv) = 'string'
                GROUP BY gv
             ) d) AS glosses
        FROM (
          SELECT DISTINCT ON (base) base, word_id, han_viet
            FROM heading_lookup
           WHERE term_lang = '${TERM_LANG}' AND native_lang = 'vi' AND char_length(base) = 1
           ORDER BY base, word_id
        ) hl
      ) m
      WHERE k.term_lang = '${TERM_LANG}' AND k.native_lang = 'vi' AND k.literal = m.literal`);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const total = await pool.query<{ c: string }>(`SELECT COUNT(*) c FROM kanji`);
  const hv = await pool.query<{ c: string }>(
    `SELECT COUNT(*) c FROM kanji WHERE native_lang='vi' AND han_viet IS NOT NULL`);
  const me = await pool.query<{ c: string }>(
    `SELECT COUNT(*) c FROM kanji WHERE native_lang='vi' AND jsonb_array_length(meanings) > 0`);

  return {
    charsParsed,
    kanjiTotal: Number(total.rows[0].c),
    viWithHanViet: Number(hv.rows[0].c),
    viWithMeanings: Number(me.rows[0].c),
  };
}
