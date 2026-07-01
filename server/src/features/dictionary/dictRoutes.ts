// Dictionary routes (mounted at /api/dict). Public look-up + suggestions; the
// rest manage the shared dictionary and require an admin (requireAdmin). SQL
// lives in dictStore; these handlers only validate input and shape the response.
import express, { Router } from "express";
import { wrap, requireAdmin } from "../../core/middleware.js";
import * as dictStore from "./dictStore.js";

export const dictRoutes = Router();

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

// Add or edit a term's meanings (upsert).
dictRoutes.put(
  "/term",
  requireAdmin,
  wrap(async (req, res) => {
    const term = String(req.body?.term ?? "").trim();
    const term_lang = String(req.body?.term_lang ?? "");
    const native_lang = String(req.body?.native_lang ?? "");
    const reading = req.body?.reading ? String(req.body.reading) : null;
    const definitions = Array.isArray(req.body?.definitions)
      ? (req.body.definitions as unknown[]).map((d) => String(d).trim()).filter(Boolean)
      : [];
    if (!term || !term_lang || !native_lang) {
      return res.status(400).json({ error: "Thiếu từ hoặc cặp ngôn ngữ" });
    }
    if (definitions.length === 0) {
      return res.status(400).json({ error: "Cần ít nhất một nghĩa" });
    }
    await dictStore.upsertTerm({ term, term_lang, native_lang, reading, definitions });
    res.json({ term, reading: reading ?? undefined, definitions, term_lang, native_lang });
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
