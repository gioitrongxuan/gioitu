// Study list routes (mounted /api/studylist). Đều theo người dùng đã đăng nhập
// (bearer token). Pha này chỉ thao tác list cá nhân; chia sẻ/cộng tác để pha sau.
import { Router } from "express";
import { wrap, requireAuth, AuthedRequest } from "../../core/middleware.js";
import * as store from "./studyListStore.js";

export const studyListRoutes = Router();

// Danh sách các list của người dùng.
studyListRoutes.get(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    res.json(await store.listsForUser(req.userId!));
  }),
);

// Tạo list mới.
studyListRoutes.post(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Thiếu tên danh sách" });
    res.json(await store.createList(req.userId!, name));
  }),
);

// Các list của người dùng có chứa từ này (cờ "marked"). Đăng ký TRƯỚC "/:id".
studyListRoutes.get(
  "/marked",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const term = String(req.query.term ?? "");
    const reading = String(req.query.reading ?? "");
    const src = String(req.query.src ?? "");
    const tgt = String(req.query.tgt ?? "");
    if (!term) return res.json([]);
    res.json(await store.markedFor(req.userId!, term, reading, src, tgt));
  }),
);

// Chi tiết một list (kèm từ).
studyListRoutes.get(
  "/:id",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const list = await store.getList(String(req.params.id), req.userId!);
    if (!list) return res.status(404).json({ error: "Không tìm thấy danh sách" });
    res.json(list);
  }),
);

// Đổi tên.
studyListRoutes.patch(
  "/:id",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Thiếu tên danh sách" });
    const ok = await store.renameList(String(req.params.id), req.userId!, name);
    if (!ok) return res.status(404).json({ error: "Không tìm thấy danh sách" });
    res.json({ ok: true });
  }),
);

// Xoá list.
studyListRoutes.delete(
  "/:id",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const ok = await store.deleteList(String(req.params.id), req.userId!);
    if (!ok) return res.status(404).json({ error: "Không tìm thấy danh sách" });
    res.json({ ok: true });
  }),
);

// Thêm một từ vào list (server giải word_id từ term/reading).
studyListRoutes.post(
  "/:id/words",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const term = String(req.body?.term ?? "").trim();
    const term_lang = String(req.body?.term_lang ?? "");
    const native_lang = String(req.body?.native_lang ?? "");
    const reading = req.body?.reading ? String(req.body.reading) : "";
    if (!term || !term_lang || !native_lang) {
      return res.status(400).json({ error: "Thiếu từ hoặc cặp ngôn ngữ" });
    }
    const result = await store.addWord(String(req.params.id), req.userId!, { term, reading, term_lang, native_lang });
    if (result === "no-list") return res.status(404).json({ error: "Không tìm thấy danh sách" });
    if (result === "no-word") return res.status(404).json({ error: "Từ này chưa có trong từ điển server" });
    if (result === "full") return res.status(400).json({ error: "Danh sách đã đầy" });
    res.json({ ok: true });
  }),
);

// Bỏ một từ khỏi list.
studyListRoutes.delete(
  "/:id/words/:wordId",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const ok = await store.removeWord(String(req.params.id), req.userId!, String(req.params.wordId));
    if (!ok) return res.status(404).json({ error: "Không tìm thấy từ trong danh sách" });
    res.json({ ok: true });
  }),
);
