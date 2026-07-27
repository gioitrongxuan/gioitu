// Data-access for the fake AnkiConnect server: persist one Yomitan note as a
// VocabEntry in `user_data` (the user's SRS list, source of truth that the web
// app pulls). Ownership is forced to the authenticated user. SQL lives here;
// the entry shaping is the pure domain in ankiNote.ts.
import { pool } from "../../core/db.js";
import { canUseSentenceAi } from "../../core/entitlements.js";
import { upsertUserData } from "../sync/userDataUpsert.js";
import { callDeepseek } from "../ai/aiClient.js";
import { buildSentenceAnalysisPrompt, parseSentenceAnalysis } from "../ai/sentenceAnalysis.js";
import type { SentenceAnalysis, VocabEntry } from "@/shared/types";
import {
  NoteFields,
  SaveNoteOptions,
  applyManualAdd,
  detectTermLang,
  fieldsToExample,
  fieldsToMeaning,
} from "./ankiNote.js";

/**
 * Save (or merge into) the user's entry for one Yomitan note and return a
 * numeric note id (a millisecond timestamp). Returning a number is what makes
 * Yomitan turn the "+" green. The read-merge-write runs in one transaction with
 * a row lock so concurrent adds of the same word cannot lose a count.
 *
 * @throws {Error} when the note has no Word.
 */
export async function saveNote(
  userId: string,
  fields: NoteFields,
  opts: SaveNoteOptions = {},
): Promise<number> {
  const term = String(fields.Word ?? "").trim();
  if (!term) throw new Error("Thiếu trường Word");

  const reading = typeof fields.Reading === "string" ? fields.Reading.trim() : "";
  const pos = typeof fields.PartOfSpeech === "string" ? fields.PartOfSpeech.trim() : "";
  const term_lang = opts.srcLang || detectTermLang(term, reading);
  const native_lang = opts.tgtLang || "vi";
  const meaning = fieldsToMeaning(fields);
  const example = fieldsToExample(fields);
  const now = Date.now();

  // Phân tích câu bằng AI (CHỈ Premium, và chỉ khi note mang sentence). Chạy
  // NGOÀI transaction vì chỉ phụ thuộc (term, sentence, cặp ngôn ngữ) — không cần
  // dữ liệu sẵn có — và để không giữ row lock trong lúc chờ LLM. Best-effort: nếu
  // AI thất bại/không cấu hình, vẫn lưu từ (phân tích chỉ là tiện ích thêm).
  let analysis: SentenceAnalysis | undefined;
  if (example && (await canUseSentenceAi(userId))) {
    try {
      const content = await callDeepseek(
        buildSentenceAnalysisPrompt({ term, reading, sentence: example, term_lang, native_lang }),
      );
      analysis = parseSentenceAnalysis(content) ?? undefined;
    } catch (err) {
      // Bỏ qua — lưu từ vẫn là hành động chính; nhưng phải log, không thì AI
      // hỏng (hết quota, sai key…) chỉ hiện ra như "Premium không có phân tích".
      console.error("Phân tích câu AI thất bại:", err);
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ payload: string }>(
      `SELECT payload FROM user_data
       WHERE user_id = $1 AND term = $2 AND term_lang = $3 FOR UPDATE`,
      [userId, term, term_lang],
    );
    const existing = rows[0] ? (JSON.parse(rows[0].payload) as VocabEntry) : undefined;
    const entry = applyManualAdd(
      existing,
      {
        user_id: userId,
        term,
        term_lang,
        native_lang,
        meaning,
        reading: reading || undefined,
        pos: pos || undefined,
        example: example || undefined,
        analysis,
      },
      now,
    );
    // `received_at` bắt buộc phải đóng dấu (= now) như syncStore: cột mặc định 0,
    // mà mốc hiệu lực LWW là min(updated_at, received_at) — bỏ trống thì mọi từ
    // thêm qua Yomitan có mốc 0 và THUA mọi bản đồng bộ đến sau, dù nó mới hơn.
    await upsertUserData(client, userId, entry, now);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return now;
}
