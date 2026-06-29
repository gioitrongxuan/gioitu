// 0003 — backfill dữ liệu `dict` cũ sang word/heading_lookup/entry. CHƯA drop
// `dict` (giữ làm phao an toàn; sẽ drop ở migration sau khi xác nhận qua thực tế).
// Mỗi dòng dict → 1 word (dedup theo heading) + 1 entry senses=[{pos:[], gloss:<definitions>}].

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0003",
  name: "backfill_dict",
  sql: `
    DO $$
    DECLARE r RECORD; wid BIGINT;
    BEGIN
      -- Bỏ qua nếu bảng dict đã bị drop ở môi trường nào đó.
      IF to_regclass('public.dict') IS NULL THEN RETURN; END IF;

      FOR r IN SELECT term, term_lang, native_lang, reading, definitions, dict_id FROM dict LOOP
        SELECT word_id INTO wid FROM heading_lookup
          WHERE term_lang = r.term_lang AND native_lang = r.native_lang
            AND base = r.term AND reading = COALESCE(r.reading, '');

        IF wid IS NULL THEN
          INSERT INTO word (term_lang, native_lang, headings)
          VALUES (
            r.term_lang, r.native_lang,
            jsonb_build_array(jsonb_strip_nulls(
              jsonb_build_object('base', r.term, 'reading', NULLIF(r.reading, ''))
            ))
          )
          RETURNING id INTO wid;

          INSERT INTO heading_lookup (term_lang, native_lang, base, reading, word_id)
          VALUES (r.term_lang, r.native_lang, r.term, COALESCE(r.reading, ''), wid);
        END IF;

        -- definitions là TEXT chứa JSON array; nếu một dòng hỏng (không phải JSON
        -- hợp lệ) thì BỎ QUA dòng đó thay vì làm sập cả migration (prod không boot).
        BEGIN
          INSERT INTO entry (word_id, dict_id, senses)
          VALUES (
            wid, r.dict_id,
            jsonb_build_array(jsonb_build_object('pos', '[]'::jsonb, 'gloss', r.definitions::jsonb))
          )
          ON CONFLICT (word_id, dict_id) DO NOTHING;
        EXCEPTION WHEN others THEN
          RAISE WARNING 'backfill bỏ qua dòng dict hỏng: term=%', r.term;
        END;
      END LOOP;
    END $$;
  `,
};
