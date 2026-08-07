// 0013 — nhật ký ôn tập lên cloud. Trước đây `review_log` chỉ sống trong
// IndexedDB của từng máy, nên chuỗi ngày + dải hoạt động ở màn "Hôm nay" đứt oan
// khi người dùng ôn trên điện thoại rồi mở máy tính (BACKLOG GĐ0).
//
// Kỷ luật KHÁC user_data: nhật ký append-only, không LWW — một lượt chấm là sự
// kiện đã xảy ra, chỉ cần tồn tại đúng một lần. Khoá duy nhất
// (user_id, term, term_lang, ts, grade) chính là danh tính một lượt chấm mà
// client dùng để khử trùng lặp (domain/reviewLog.ts), nên đẩy lại cùng một mẻ là
// vô hại. `seq` là con trỏ pull: tăng theo thứ tự server ghi, nhờ vậy một máy
// offline nhiều ngày rồi mới đẩy nhật ký cũ lên vẫn tới được các máy khác (lọc
// theo `ts` thì những dòng cũ đó bị bỏ sót vĩnh viễn).

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0013",
  name: "review_log",
  sql: `
    CREATE TABLE IF NOT EXISTS review_log (
      seq BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      term TEXT NOT NULL,
      term_lang TEXT NOT NULL,
      grade TEXT NOT NULL,
      ts BIGINT NOT NULL,
      interval_before DOUBLE PRECISION NOT NULL,
      interval_after DOUBLE PRECISION NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_log_event
      ON review_log(user_id, term, term_lang, ts, grade);
    CREATE INDEX IF NOT EXISTS idx_review_log_seq ON review_log(user_id, seq);
  `,
};
