// Bình luận / góp ý của người dùng cho một từ (mounted /api/comments, #23).
// GET công khai (guest đọc được); POST/DELETE cần đăng nhập. SQL ở commentStore.
import { Router } from "express";
import { wrap, requireAuth, AuthedRequest } from "../../core/middleware.js";
import * as commentStore from "./commentStore.js";

export const commentRoutes = Router();

// Công khai: đọc bình luận của một từ theo khoá (term_lang, native_lang, term, reading).
commentRoutes.get(
  "/",
  wrap(async (req, res) => {
    const q = req.query;
    res.json(
      await commentStore.listForWord({
        term_lang: String(q.term_lang ?? ""),
        native_lang: String(q.native_lang ?? ""),
        term: String(q.term ?? ""),
        reading: q.reading != null ? String(q.reading) : null,
      }),
    );
  }),
);

// Đăng nhập: thêm bình luận.
commentRoutes.post(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const b = req.body ?? {};
    const result = await commentStore.addComment(
      req.userId!,
      {
        term_lang: String(b.term_lang ?? ""),
        native_lang: String(b.native_lang ?? ""),
        term: String(b.term ?? ""),
        reading: b.reading != null ? String(b.reading) : null,
      },
      String(b.body ?? ""),
    );
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result.comment);
  }),
);

// Đăng nhập: xoá bình luận của mình (admin xoá bất kỳ).
commentRoutes.delete(
  "/:id",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const ok = await commentStore.deleteComment(String(req.params.id), req.userId!);
    if (!ok) return res.status(404).json({ error: "Không tìm thấy bình luận" });
    res.json({ ok: true });
  }),
);
