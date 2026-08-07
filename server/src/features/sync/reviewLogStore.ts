// Nhật ký ôn tập trên cloud — data-access. Khác syncStore (user_data) ở kỷ luật:
// append-only, KHÔNG merge/LWW. Mỗi lượt chấm chỉ cần tồn tại đúng một lần, nên
// trùng lặp do đẩy lại bị khoá duy nhất nuốt êm (ON CONFLICT DO NOTHING) thay vì
// phải so mốc. Ownership luôn ép về user đã xác thực (client không gửi user_id).
import { pool } from "../../core/db.js";
import { LOG_PAGE_SIZE, ReviewLogRow } from "./reviewLogRows.js";

/** Một trang nhật ký kèm con trỏ để client kéo tiếp. */
export interface LogPage {
  rows: ReviewLogRow[];
  /** `seq` của dòng cuối trang; trang rỗng thì giữ nguyên `since` của client. */
  cursor: number;
  /** Trang đầy = còn dòng phía sau, client kéo tiếp ngay trong cùng lượt sync. */
  more: boolean;
}

/** Dòng như pg trả về: BIGINT (`seq`, `ts`) là chuỗi, không phải số. */
interface LogRowSql extends Omit<ReviewLogRow, "ts"> {
  seq: string;
  ts: string;
}

/** Các dòng ghi SAU con trỏ `since` (theo thứ tự server ghi, không theo `ts`). */
export async function pull(userId: string, since: number): Promise<LogPage> {
  const { rows } = await pool.query<LogRowSql>(
    `SELECT seq, term, term_lang, grade, ts, interval_before, interval_after
       FROM review_log
      WHERE user_id = $1 AND seq > $2
      ORDER BY seq
      LIMIT $3`,
    [userId, since, LOG_PAGE_SIZE],
  );
  return {
    // BIGINT về từ pg là chuỗi (số 64-bit không lọt an toàn vào Number ở mọi
    // biên độ) — ép lại ở đây để client nhận đúng kiểu số như lúc nó đẩy lên.
    rows: rows.map(({ seq: _seq, ts, ...r }) => ({ ...r, ts: Number(ts) })),
    cursor: rows.length > 0 ? Number(rows[rows.length - 1].seq) : since,
    more: rows.length === LOG_PAGE_SIZE,
  };
}

/** Ghi thêm các dòng chưa có; trả về số dòng THẬT SỰ mới (đã trừ dòng trùng). */
export async function push(userId: string, rows: ReviewLogRow[]): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Nối tiếp các lượt push của CÙNG một người: `seq` khi đó tăng đúng theo thứ
    // tự commit, nên con trỏ pull `seq > cursor` không thể nhảy qua một dòng được
    // cấp seq nhỏ hơn nhưng commit muộn hơn (hai máy đẩy cùng lúc).
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
    let inserted = 0;
    for (const r of rows) {
      const res = await client.query(
        `INSERT INTO review_log (user_id, term, term_lang, grade, ts, interval_before, interval_after)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, term, term_lang, ts, grade) DO NOTHING`,
        [userId, r.term, r.term_lang, r.grade, r.ts, r.interval_before, r.interval_after],
      );
      inserted += res.rowCount ?? 0;
    }
    await client.query("COMMIT");
    return { inserted };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
