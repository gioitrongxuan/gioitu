// Minimal demo dictionaries (one small set per language pair) so every
// direction returns something out of the box.
import { pool } from "./db.js";

interface SeedEntry {
  term: string;
  reading?: string;
  definitions: string[];
  term_lang: string;
  native_lang: string;
}

const SAMPLE: SeedEntry[] = [
  // --- Anh → Việt ---
  { term: "ephemeral", definitions: ["phù du, chóng tàn"], term_lang: "en", native_lang: "vi" },
  { term: "resilient", definitions: ["kiên cường", "có khả năng phục hồi"], term_lang: "en", native_lang: "vi" },
  { term: "meticulous", definitions: ["tỉ mỉ, kỹ lưỡng"], term_lang: "en", native_lang: "vi" },
  // --- Việt → Anh ---
  { term: "kiên cường", definitions: ["resilient", "steadfast"], term_lang: "vi", native_lang: "en" },
  { term: "tỉ mỉ", definitions: ["meticulous", "thorough"], term_lang: "vi", native_lang: "en" },
  // --- Nhật → Việt ---
  { term: "勉強", reading: "べんきょう", definitions: ["sự học tập", "việc học"], term_lang: "ja", native_lang: "vi" },
  { term: "猫", reading: "ねこ", definitions: ["con mèo"], term_lang: "ja", native_lang: "vi" },
  // --- Việt → Nhật ---
  { term: "học tập", definitions: ["勉強（べんきょう）"], term_lang: "vi", native_lang: "ja" },
  { term: "con mèo", definitions: ["猫（ねこ）"], term_lang: "vi", native_lang: "ja" },
];

export async function seedIfEmpty(): Promise<void> {
  const { rows } = await pool.query<{ c: string }>("SELECT COUNT(*) AS c FROM dict");
  if (Number(rows[0].c) > 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const e of SAMPLE) {
      await client.query(
        `INSERT INTO dict (term, term_lang, native_lang, reading, definitions)
         VALUES ($1, $2, $3, $4, $5)`,
        [e.term, e.term_lang, e.native_lang, e.reading ?? null, JSON.stringify(e.definitions)],
      );
    }
    await client.query("COMMIT");
    console.log(`Seeded ${SAMPLE.length} demo dictionary entries across 4 pairs.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
