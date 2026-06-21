// Dictionary data-access (SQL). Keeps all `dict` / `dictionaries` queries out of
// the HTTP layer so routes stay thin and the SQL is unit-testable in isolation.
import { randomUUID } from "node:crypto";
import { pool, rowToDictEntry, DictRow } from "../../core/db.js";
import { parseYomitanZip } from "./yomitan.js";

export interface ImportSummary {
  dict_id: string;
  title: string;
  termCount: number;
  term_lang: string;
  native_lang: string;
}

/** Forward lookup, scoped to a language pair (SPEC 2.A). */
export async function lookup(term: string, src: string, tgt: string) {
  const { rows } = await pool.query<DictRow>(
    "SELECT * FROM dict WHERE term_lang = $1 AND native_lang = $2 AND term = $3",
    [src, tgt, term],
  );
  return rows[0] ? rowToDictEntry(rows[0]) : null;
}

/** Prefix suggestions within a language pair. */
export async function suggest(prefix: string, src: string, tgt: string) {
  const { rows } = await pool.query<DictRow>(
    `SELECT * FROM dict WHERE term_lang = $1 AND native_lang = $2
     AND term >= $3 AND term < $4 ORDER BY term LIMIT 10`,
    [src, tgt, prefix, prefix + "￿"],
  );
  return rows.map(rowToDictEntry);
}

/**
 * Near-miss look-up by edit distance, for when the query is misspelled or
 * misremembered. Mirrors the client's fuzzy matcher: distance is taken against
 * the smaller of the term and its reading (so a kana query finds a kanji
 * headword), bounded by `max`. A char-length pre-filter skips obviously-distant
 * rows before the (bounded) Levenshtein runs, and results are closest-first.
 */
export async function fuzzy(term: string, src: string, tgt: string, max: number, limit = 8) {
  const { rows } = await pool.query<DictRow>(
    `WITH scored AS (
       SELECT term, reading, definitions, term_lang, native_lang,
         LEAST(
           levenshtein_less_equal($3, term, $4),
           CASE WHEN reading IS NOT NULL AND reading <> term
                THEN levenshtein_less_equal($3, reading, $4)
                ELSE $4 + 1 END
         ) AS distance
       FROM dict
       WHERE term_lang = $1 AND native_lang = $2
         AND (
           abs(char_length(term) - char_length($3)) <= $4
           OR (reading IS NOT NULL AND abs(char_length(reading) - char_length($3)) <= $4)
         )
     )
     SELECT term, reading, definitions, term_lang, native_lang
       FROM scored WHERE distance <= $4
      ORDER BY distance, term LIMIT $5`,
    [src, tgt, term, max, limit],
  );
  return rows.map(rowToDictEntry);
}

/** Parse a Yomitan archive buffer and bulk-insert it as a new dictionary. */
export async function importBuffer(
  buf: Buffer,
  opts: { term_lang?: string; native_lang?: string },
): Promise<ImportSummary> {
  const parsed = await parseYomitanZip(buf, opts);
  if (parsed.entries.length === 0) {
    throw new Error("Không tìm thấy từ nào trong file");
  }

  const dictId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO dictionaries (id, title, term_lang, native_lang, created_at) VALUES ($1, $2, $3, $4, $5)",
      [dictId, parsed.title, parsed.term_lang, parsed.native_lang, Date.now()],
    );
    // Bulk insert in chunks (one multi-row statement each) for speed.
    const CHUNK = 1000;
    for (let i = 0; i < parsed.entries.length; i += CHUNK) {
      const slice = parsed.entries.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const tuples = slice.map((e, j) => {
        const b = j * 6;
        values.push(
          e.term,
          parsed.term_lang,
          parsed.native_lang,
          e.reading ?? null,
          JSON.stringify(e.definitions),
          dictId,
        );
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
      });
      await client.query(
        `INSERT INTO dict (term, term_lang, native_lang, reading, definitions, dict_id)
         VALUES ${tuples.join(", ")}
         ON CONFLICT (term_lang, native_lang, term) DO UPDATE SET
           reading = EXCLUDED.reading,
           definitions = EXCLUDED.definitions,
           dict_id = EXCLUDED.dict_id`,
        values,
      );
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

/** List imported dictionaries with their current term counts. */
export async function listDictionaries() {
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.term_lang, d.native_lang, d.created_at,
            COUNT(t.term)::int AS term_count
       FROM dictionaries d
       LEFT JOIN dict t ON t.dict_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at DESC`,
  );
  return rows;
}

/** Delete a dictionary and all of its terms. Returns false if it did not exist. */
export async function deleteDictionary(id: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM dict WHERE dict_id = $1", [id]);
    const del = await client.query("DELETE FROM dictionaries WHERE id = $1", [id]);
    await client.query("COMMIT");
    return Boolean(del.rowCount);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Browse / prefix-search terms within a language pair (paginated). */
export async function browseTerms(
  src: string,
  tgt: string,
  q: string,
  limit: number,
  offset: number,
) {
  // Escape LIKE wildcards in the user query; match as a prefix.
  const like = q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
  const hasQ = q.length > 0;

  const where = `term_lang = $1 AND native_lang = $2${hasQ ? " AND term ILIKE $3" : ""}`;
  const params = hasQ ? [src, tgt, like] : [src, tgt];

  const total = await pool.query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM dict WHERE ${where}`,
    params,
  );
  const { rows } = await pool.query<DictRow & { dict_id: string | null }>(
    `SELECT term, reading, definitions, term_lang, native_lang, dict_id
       FROM dict WHERE ${where}
      ORDER BY term LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  return {
    total: Number(total.rows[0].c),
    items: rows.map((r) => ({ ...rowToDictEntry(r), dict_id: r.dict_id })),
  };
}

/** Add or edit a term's meanings (upsert). Manual terms have no dict_id. */
export async function upsertTerm(entry: {
  term: string;
  term_lang: string;
  native_lang: string;
  reading: string | null;
  definitions: string[];
}) {
  await pool.query(
    `INSERT INTO dict (term, term_lang, native_lang, reading, definitions, dict_id)
     VALUES ($1, $2, $3, $4, $5, NULL)
     ON CONFLICT (term_lang, native_lang, term) DO UPDATE SET
       reading = EXCLUDED.reading,
       definitions = EXCLUDED.definitions`,
    [entry.term, entry.term_lang, entry.native_lang, entry.reading, JSON.stringify(entry.definitions)],
  );
}

/** Delete a single term. Returns false if it did not exist. */
export async function deleteTerm(term: string, src: string, tgt: string): Promise<boolean> {
  const del = await pool.query(
    "DELETE FROM dict WHERE term_lang = $1 AND native_lang = $2 AND term = $3",
    [src, tgt, term],
  );
  return Boolean(del.rowCount);
}
