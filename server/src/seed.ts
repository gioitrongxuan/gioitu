// Minimal demo dictionary so the backend fallback returns something out-of-box.
import { db } from "./db.js";

const SAMPLE: Array<{ term: string; reading?: string; definitions: string[] }> = [
  { term: "ephemeral", definitions: ["phù du, chóng tàn", "tồn tại trong thời gian ngắn"] },
  { term: "resilient", definitions: ["kiên cường", "có khả năng phục hồi nhanh"] },
  { term: "serendipity", definitions: ["sự tình cờ may mắn", "khả năng tìm ra điều tốt đẹp ngoài ý muốn"] },
  { term: "ubiquitous", definitions: ["có mặt khắp nơi", "phổ biến rộng rãi"] },
  { term: "meticulous", definitions: ["tỉ mỉ, kỹ lưỡng", "cẩn thận đến từng chi tiết"] },
  { term: "candor", definitions: ["sự thẳng thắn", "tính trung thực, chân thành"] },
  { term: "pragmatic", definitions: ["thực dụng", "thiên về thực tế hơn lý thuyết"] },
  { term: "nuance", definitions: ["sắc thái tinh tế", "khác biệt nhỏ về ý nghĩa"] },
];

export function seedIfEmpty() {
  const count = (db.prepare("SELECT COUNT(*) AS c FROM dict").get() as { c: number }).c;
  if (count > 0) return;

  const insert = db.prepare(
    `INSERT INTO dict (term, reading, definitions, term_lang, native_lang, meaning)
     VALUES (?, ?, ?, 'en', 'vi', ?)`,
  );
  const insertFts = db.prepare(
    "INSERT INTO dict_fts (rowid, term, meaning) VALUES (last_insert_rowid(), ?, ?)",
  );
  const tx = db.transaction(() => {
    for (const e of SAMPLE) {
      const meaning = e.definitions.join(" ");
      insert.run(e.term, e.reading ?? null, JSON.stringify(e.definitions), meaning);
      insertFts.run(e.term, meaning);
    }
  });
  tx();
  console.log(`Seeded ${SAMPLE.length} demo dictionary entries.`);
}
