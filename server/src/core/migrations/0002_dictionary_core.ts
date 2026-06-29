// 0002 — lõi từ điển mới (kế thừa jisho Word.Entry) + study list + liên kết SRS.
// Chỉ THÊM (additive): chưa backfill `dict` cũ, chưa drop — store vẫn chạy đường cũ
// cho tới khi cắt sang ở migration sau. Xem thiết kế đầy đủ ở plan/scratchpad schema.sql.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0002",
  name: "dictionary_core",
  sql: `
    CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy/substring nhanh ở quy mô lớn
    CREATE EXTENSION IF NOT EXISTS unaccent;   -- tra Hán-Việt bỏ dấu
    -- unaccent() không immutable → bọc lại để dùng trong index biểu thức.
    CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
      LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$ SELECT unaccent('unaccent', $1) $$;

    -- Phân loại nguồn cho registry từ điển (Mazii / Yomitan / thủ công).
    ALTER TABLE dictionaries ADD COLUMN IF NOT EXISTS source TEXT;
    ALTER TABLE dictionaries ADD COLUMN IF NOT EXISTS revision TEXT;

    -- LEXEME: một "từ". headings giữ nguyên cấu trúc nhiều-cách-viết của jisho.
    CREATE TABLE IF NOT EXISTS word (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      term_lang   TEXT NOT NULL,
      native_lang TEXT NOT NULL,
      headings    JSONB NOT NULL,
      pitch       JSONB,
      freq_rank   INT,
      jlpt        SMALLINT,
      score       INT NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_word_pair ON word (term_lang, native_lang);

    -- Bản chiếu để tra: 1 dòng / cách viết. PK ép bất biến dedup
    -- (một (cặp ngôn ngữ, cách viết, âm đọc) thuộc đúng một word).
    CREATE TABLE IF NOT EXISTS heading_lookup (
      term_lang   TEXT NOT NULL,
      native_lang TEXT NOT NULL,
      base        TEXT NOT NULL,
      reading     TEXT NOT NULL DEFAULT '',
      word_id     BIGINT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
      han_viet    TEXT,
      PRIMARY KEY (term_lang, native_lang, base, reading)
    );
    CREATE INDEX IF NOT EXISTS idx_hl_base        ON heading_lookup (term_lang, native_lang, base);
    CREATE INDEX IF NOT EXISTS idx_hl_reading     ON heading_lookup (term_lang, native_lang, reading);
    CREATE INDEX IF NOT EXISTS idx_hl_base_trgm   ON heading_lookup USING gin (base gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_hl_reading_trgm ON heading_lookup USING gin (reading gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_hl_hanviet     ON heading_lookup (han_viet);
    CREATE INDEX IF NOT EXISTS idx_hl_hanviet_ua  ON heading_lookup USING gin (immutable_unaccent(han_viet) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_hl_word        ON heading_lookup (word_id);

    -- Sense theo nguồn (kế thừa jisho Word.Sense). dict_id NULL = nghĩa thủ công.
    CREATE TABLE IF NOT EXISTS entry (
      id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      word_id BIGINT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
      dict_id TEXT REFERENCES dictionaries(id) ON DELETE CASCADE,
      senses  JSONB NOT NULL,
      score   INT NOT NULL DEFAULT 0,
      UNIQUE (word_id, dict_id)
    );
    CREATE INDEX IF NOT EXISTS idx_entry_word ON entry (word_id);
    CREATE INDEX IF NOT EXISTS idx_entry_dict ON entry (dict_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entry_manual_one ON entry (word_id) WHERE dict_id IS NULL;

    -- Ảnh + bình luận Mazii (read-only), cấp TỪ.
    CREATE TABLE IF NOT EXISTS word_image (
      id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      word_id BIGINT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
      url     TEXT NOT NULL,
      source  TEXT,
      ord     INT NOT NULL DEFAULT 0,
      UNIQUE (word_id, url)
    );
    CREATE INDEX IF NOT EXISTS idx_word_image_word ON word_image (word_id);

    CREATE TABLE IF NOT EXISTS word_comment (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      word_id    BIGINT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
      mean       TEXT NOT NULL,
      likes      INT NOT NULL DEFAULT 0,
      dislikes   INT NOT NULL DEFAULT 0,
      author     TEXT,
      avatar     TEXT,
      source     TEXT,
      source_id  TEXT,
      created_at BIGINT,
      UNIQUE (source, source_id)
    );
    CREATE INDEX IF NOT EXISTS idx_word_comment_word ON word_comment (word_id);

    -- Kanji (kế thừa jisho Kanji.Entry). Thiết kế sẵn, hoãn nạp dữ liệu.
    CREATE TABLE IF NOT EXISTS kanji (
      literal       TEXT NOT NULL,
      term_lang     TEXT NOT NULL DEFAULT 'ja',
      native_lang   TEXT NOT NULL,
      jouyou        SMALLINT,
      jinmeiyou     BOOLEAN,
      jlpt          SMALLINT,
      rank_news     INT,
      stroke_count  SMALLINT,
      stroke_counts JSONB,
      meanings      JSONB,
      readings      JSONB,
      components    JSONB,
      structural    JSONB,
      score         INT,
      PRIMARY KEY (term_lang, native_lang, literal)
    );
    CREATE INDEX IF NOT EXISTS idx_kanji_literal ON kanji (literal);

    -- Study list (kế thừa jisho). Dữ liệu người dùng; chuẩn hoá (list tới 10k từ).
    CREATE TABLE IF NOT EXISTS study_list (
      id              TEXT PRIMARY KEY,
      creator_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      is_public       BOOLEAN NOT NULL DEFAULT false,
      editor_password TEXT,
      word_count      INT NOT NULL DEFAULT 0,
      created_at      BIGINT NOT NULL,
      modified_at     BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sl_creator ON study_list (creator_id);
    CREATE INDEX IF NOT EXISTS idx_sl_public  ON study_list (is_public) WHERE is_public;

    CREATE TABLE IF NOT EXISTS study_list_word (
      list_id  TEXT   NOT NULL REFERENCES study_list(id) ON DELETE CASCADE,
      word_id  BIGINT NOT NULL REFERENCES word(id) ON DELETE CASCADE,
      furigana TEXT,
      ord      INT,
      added_at BIGINT NOT NULL,
      PRIMARY KEY (list_id, word_id)
    );
    CREATE INDEX IF NOT EXISTS idx_slw_word ON study_list_word (word_id);

    CREATE TABLE IF NOT EXISTS study_list_editor (
      list_id TEXT NOT NULL REFERENCES study_list(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (list_id, user_id)
    );

    -- Liên kết SRS ↔ từ điển: thẻ học trỏ tới word (cache, re-resolve qua heading_lookup).
    ALTER TABLE user_data ADD COLUMN IF NOT EXISTS word_id BIGINT;
    ALTER TABLE user_data DROP CONSTRAINT IF EXISTS fk_user_data_word;
    ALTER TABLE user_data
      ADD CONSTRAINT fk_user_data_word FOREIGN KEY (word_id) REFERENCES word(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_user_data_word ON user_data (word_id);
  `,
};
