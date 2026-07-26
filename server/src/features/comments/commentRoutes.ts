// Bình luận / góp ý của người dùng cho một từ (mounted /api/comments, #23).
// GET công khai (guest đọc được); POST/DELETE cần đăng nhập. SQL ở commentStore.
import { Router } from "express";
import { wrap, requireAuth, AuthedRequest } from "../../core/middleware.js";
import * as commentStore from "./commentStore.js";

export const commentRoutes = Router();

/** Con trỏ "cũ hơn" từ query; thiếu hoặc hỏng thì coi như xin trang đầu. */
function cursorFrom(ts: unknown, id: unknown): commentStore.CommentCursor | null {
  const created_at = Number(ts);
  if (ts == null || id == null || !Number.isFinite(created_at)) return null;
  return { created_at, id: String(id) };
}

// Công khai: đọc một trang bình luận của một từ theo khoá (term_lang,
// native_lang, term, reading) — mới → cũ, "Xem thêm" gửi kèm before_ts/before_id.
commentRoutes.get(
  "/",
  wrap(async (req, res) => {
    const q = req.query;
    res.json(
      await commentStore.listForWord(
        {
          term_lang: String(q.term_lang ?? ""),
          native_lang: String(q.native_lang ?? ""),
          term: String(q.term ?? ""),
          reading: q.reading != null ? String(q.reading) : null,
        },
        {
          limit: q.limit != null ? Number(q.limit) : undefined,
          before: cursorFrom(q.before_ts, q.before_id),
        },
      ),
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
