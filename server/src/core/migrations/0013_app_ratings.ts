// 0013 — Người dùng đánh giá ứng dụng (#245): mấy sao + nhận xét ngắn tuỳ chọn.
// `user_id` là KHOÁ CHÍNH, không phải cột thường: một người một đánh giá, gửi
// lại là sửa chính nó (upsert). Nếu cho phép nhiều dòng thì điểm trung bình
// thành ra ai bấm nhiều lần người đó nặng ký.
//
// Email người đánh giá KHÔNG lưu ở đây — join `users` lúc admin đọc, nên không
// có bản sao email lạc hậu (cùng lối với các bảng khác).

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0013",
  name: "app_ratings",
  sql: `
    CREATE TABLE IF NOT EXISTS app_ratings (
      user_id    TEXT PRIMARY KEY,
      stars      SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
      note       TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_app_ratings_updated ON app_ratings(updated_at DESC);
  `,
};
