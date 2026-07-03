// Dictionary routes (mounted at /api/dict). Public look-up + suggestions; the
// rest manage the shared dictionary and require an admin (requireAdmin). SQL
// lives in dictStore; these handlers only validate input and shape the response.
import express, { Router } from "express";
import type { EditableSense, JlptLevel, PitchAccent } from "@/shared/dictionary";
import { wrap, requireAdmin } from "../../core/middleware.js";
import * as dictStore from "./dictStore.js";

export const dictRoutes = Router();

// --- Nắn body của PUT /term (tin admin, nhưng vẫn chuẩn hoá kiểu) ---

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

/** Id BIGINT (word/entry/ảnh/bình luận) — không phải chuỗi số thì coi như thiếu. */
const asId = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return /^\d+$/.test(s) ? s : "";
};

function parseSenses(raw: unknown): EditableSense[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    const examples = Array.isArray(o.examples)
      ? (o.examples as unknown[])
          .map((e) => {
            const eo = (e ?? {}) as Record<string, unknown>;
            return { ja: String(eo.ja ?? "").trim(), vi: String(eo.vi ?? "").trim() };
          })
          .filter((e) => e.ja || e.vi)
      : [];
    return { pos: asStrings(o.pos), misc: asStrings(o.misc), gloss: asStrings(o.gloss), info: asStrings(o.info), examples };
  });
}

/** `pitch` vắng → undefined (giữ nguyên); `[]` → xoá; ngược lại lọc mục hợp lệ. */
function parsePitch(raw: unknown): PitchAccent[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return {
        kana: o.kana ? String(o.kana) : undefined,
        accent: o.accent ? String(o.accent) : undefined,
        moras: Array.isArray(o.moras) ? o.moras.map(String) : undefined,
      };
    })
    .filter((p) => Boolean(p.accent && p.moras && p.moras.length));
}

// --- Public: forward lookup, scoped to a language pair (SPEC 2.A) ---
dictRoutes.get(
  "/lookup",
  wrap(async (req, res) => {
    const term = String(req.query.term ?? "");
    const src = String(req.query.src ?? "");
    const tgt = String(req.query.tgt ?? "");
    res.json(await dictStore.lookupMany(term, src, tgt));
  }),
);

// --- Public: prefix suggestions within a language pair ---
dictRoutes.get(
  "/suggest",
  wrap(async (req, res) => {
    const prefix = String(req.query.prefix ?? "");
    const src = String(req.query.src ?? "");
    const tgt = String(req.query.tgt ?? "");
    if (!prefix) return res.json([]);
    res.json(await dictStore.suggest(prefix, src, tgt));
  }),
);

// --- Public: fuzzy near-misses by edit distance ("did you mean…") ---
dictRoutes.get(
  "/fuzzy",
  wrap(async (req, res) => {
    const term = String(req.query.term ?? "");
    const src = String(req.query.src ?? "");
    const tgt = String(req.query.tgt ?? "");
    if (!term) return res.json([]);
    // Fuzzy giờ dùng pg_trgm (xếp theo độ tương tự, bounded bằng ngưỡng %).
    res.json(await dictStore.fuzzy(term, src, tgt));
  }),
);

// Import a Yomitan .zip. The body is the raw archive (Content-Type
// application/zip); the language pair is taken from ?src=&tgt= when given,
// otherwise from the archive's index.json.
dictRoutes.post(
  "/import",
  requireAdmin,
  express.raw({ type: ["application/zip", "application/octet-stream"], limit: "256mb" }),
  wrap(async (req, res) => {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: "Thiếu dữ liệu file .zip" });
    }
    const src = req.query.src ? String(req.query.src) : undefined;
    const tgt = req.query.tgt ? String(req.query.tgt) : undefined;
    try {
      res.json(await dictStore.importBuffer(buf, { term_lang: src, native_lang: tgt }));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || "File .zip không hợp lệ (không phải Yomitan)" });
    }
  }),
);

// Import a Yomitan .zip from a URL (the server downloads it). Body: { url }.
dictRoutes.post(
  "/import-url",
  requireAdmin,
  wrap(async (req, res) => {
    const url = String(req.body?.url ?? "").trim();
    const src = req.body?.src ? String(req.body.src) : undefined;
    const tgt = req.body?.tgt ? String(req.body.tgt) : undefined;
    if (!/^https?:\/\//.test(url)) {
      return res.status(400).json({ error: "URL không hợp lệ" });
    }
    let buf: Buffer;
    try {
      const resp = await fetch(url, { redirect: "follow" });
      if (!resp.ok) return res.status(400).json({ error: `Tải URL thất bại (HTTP ${resp.status})` });
      buf = Buffer.from(await resp.arrayBuffer());
    } catch {
      return res.status(400).json({ error: "Không tải được URL từ máy chủ" });
    }
    try {
      res.json(await dictStore.importBuffer(buf, { term_lang: src, native_lang: tgt }));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || "File .zip không hợp lệ" });
    }
  }),
);

// List imported dictionaries with their current term counts.
dictRoutes.get(
  "/dictionaries",
  requireAdmin,
  wrap(async (_req, res) => {
    res.json(await dictStore.listDictionaries());
  }),
);

// Delete a dictionary and all of its terms.
dictRoutes.delete(
  "/dictionaries/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const found = await dictStore.deleteDictionary(String(req.params.id));
    if (!found) return res.status(404).json({ error: "Không tìm thấy từ điển" });
    res.json({ ok: true });
  }),
);

// Browse / search terms within a language pair (paginated).
dictRoutes.get(
  "/terms",
  requireAdmin,
  wrap(async (req, res) => {
    const src = String(req.query.src ?? "");
    const tgt = String(req.query.tgt ?? "");
    const q = String(req.query.q ?? "").trim();
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    res.json(await dictStore.browseTerms(src, tgt, q, limit, offset));
  }),
);

// Fetch a term's full editable state (manual senses + word attributes + a
// read-only view of what imported dictionaries already say).
dictRoutes.get(
  "/term/edit",
  requireAdmin,
  wrap(async (req, res) => {
    const src = String(req.query.src ?? "");
    const tgt = String(req.query.tgt ?? "");
    const term = String(req.query.term ?? "").trim();
    const reading = String(req.query.reading ?? "");
    if (!term || !src || !tgt) return res.status(400).json({ error: "Thiếu tham số" });
    const state = await dictStore.getTermForEdit(src, tgt, term, reading);
    if (!state) return res.status(404).json({ error: "Không tìm thấy từ" });
    res.json(state);
  }),
);

// Add or edit a term (upsert): manual senses (POS / usage / glosses / examples /
// notes) plus word attributes (reading / Hán-Việt / JLPT / pitch).
dictRoutes.put(
  "/term",
  requireAdmin,
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const term = String(body.term ?? "").trim();
    const term_lang = String(body.term_lang ?? "");
    const native_lang = String(body.native_lang ?? "");
    const word_id = asId(body.word_id) || undefined;
    const reading = body.reading ? String(body.reading) : null;
    const hanViet = body.hanViet ? String(body.hanViet).trim() : undefined;
    const jlptNum = Number(body.jlpt);
    const jlpt = jlptNum >= 1 && jlptNum <= 5 ? (jlptNum as JlptLevel) : undefined;
    const pitch = parsePitch(body.pitch);
    const senses = parseSenses(body.senses);

    if (!term || !term_lang || !native_lang) {
      return res.status(400).json({ error: "Thiếu từ hoặc cặp ngôn ngữ" });
    }
    // Senses rỗng hợp lệ khi từ đã tồn tại (chỉ sửa thuộc tính / xoá lớp thủ
    // công); store tự bác nếu là từ mới — trả 400 với thông điệp của nó.
    try {
      await dictStore.upsertTerm({ word_id, term, term_lang, native_lang, reading, hanViet, jlpt, pitch, senses });
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message || "Không lưu được từ" });
    }
    res.json({ ok: true });
  }),
);

// Bật/tắt cờ kiểm duyệt của một từ (tích xanh cạnh từ khi tra).
dictRoutes.post(
  "/term/verify",
  requireAdmin,
  wrap(async (req, res) => {
    const wordId = asId(req.body?.word_id);
    const verified = req.body?.verified === true;
    if (!wordId) return res.status(400).json({ error: "Thiếu word_id" });
    const found = await dictStore.setTermVerified(wordId, verified);
    if (!found) return res.status(404).json({ error: "Không tìm thấy từ" });
    res.json({ ok: true, verified });
  }),
);

// Ghi đè nghĩa của một nguồn đã nhập (một dòng entry). Senses rỗng = gỡ nguồn
// đó khỏi từ. Lưu ý: sửa thay glossary có cấu trúc bằng văn bản thuần.
dictRoutes.put(
  "/term/entry",
  requireAdmin,
  wrap(async (req, res) => {
    const entryId = asId(req.body?.entry_id);
    if (!entryId) return res.status(400).json({ error: "Thiếu entry_id" });
    const senses = parseSenses(req.body?.senses);
    const { found, deleted } = await dictStore.updateEntrySenses(entryId, senses);
    if (!found) return res.status(404).json({ error: "Không tìm thấy nguồn nghĩa" });
    res.json({ ok: true, deleted });
  }),
);

// Thêm một ảnh minh hoạ cho từ (admin dán URL).
dictRoutes.post(
  "/term/image",
  requireAdmin,
  wrap(async (req, res) => {
    const wordId = asId(req.body?.word_id);
    const url = String(req.body?.url ?? "").trim();
    if (!wordId) return res.status(400).json({ error: "Thiếu word_id" });
    if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: "URL ảnh không hợp lệ" });
    try {
      const image = await dictStore.addWordImage(wordId, url);
      if (!image) return res.status(404).json({ error: "Không tìm thấy từ" });
      res.json(image);
    } catch {
      // FK gãy khi word_id không tồn tại — báo 404 thay vì 500.
      res.status(404).json({ error: "Không tìm thấy từ" });
    }
  }),
);

// Gỡ một ảnh minh hoạ.
dictRoutes.delete(
  "/term/image",
  requireAdmin,
  wrap(async (req, res) => {
    const id = asId(req.body?.id);
    if (!id) return res.status(400).json({ error: "Thiếu id ảnh" });
    const found = await dictStore.deleteWordImage(id);
    if (!found) return res.status(404).json({ error: "Không tìm thấy ảnh" });
    res.json({ ok: true });
  }),
);

// Gỡ một bình luận cộng đồng.
dictRoutes.delete(
  "/term/comment",
  requireAdmin,
  wrap(async (req, res) => {
    const id = asId(req.body?.id);
    if (!id) return res.status(400).json({ error: "Thiếu id bình luận" });
    const found = await dictStore.deleteWordComment(id);
    if (!found) return res.status(404).json({ error: "Không tìm thấy bình luận" });
    res.json({ ok: true });
  }),
);

// Delete a single term.
dictRoutes.delete(
  "/term",
  requireAdmin,
  wrap(async (req, res) => {
    const term = String(req.body?.term ?? "");
    const term_lang = String(req.body?.term_lang ?? "");
    const native_lang = String(req.body?.native_lang ?? "");
    const found = await dictStore.deleteTerm(term, term_lang, native_lang);
    if (!found) return res.status(404).json({ error: "Không tìm thấy từ" });
    res.json({ ok: true });
  }),
);
