// Logic thuần cho bình luận / góp ý của người dùng trên một từ (#23). Không phụ
// thuộc React/mạng để test dễ; `data/` và `ui/` bọc quanh.

/** Khoá một từ để gắn bình luận — cùng bộ với store `terms` (không gộp đồng âm). */
export interface WordKey {
  term_lang: string;
  native_lang: string;
  term: string;
  reading: string | null;
}

export interface Comment {
  id: string;
  term_lang: string;
  native_lang: string;
  term: string;
  reading: string | null;
  user_id: string;
  author_name: string;
  body: string;
  created_at: number;
}

export const MAX_COMMENT_LENGTH = 2000;

export type CommentValidation = { ok: true; body: string } | { ok: false; error: string };

/** Kiểm tra nội dung bình luận trước khi gửi (trim + không rỗng + giới hạn dài). */
export function validateComment(raw: string): CommentValidation {
  const body = raw.trim();
  if (!body) return { ok: false, error: "Bình luận trống" };
  if (body.length > MAX_COMMENT_LENGTH)
    return { ok: false, error: `Bình luận tối đa ${MAX_COMMENT_LENGTH} ký tự` };
  return { ok: true, body };
}

/** Người dùng có được xoá bình luận này không: tác giả của nó, hoặc admin. */
export function canDeleteComment(
  comment: Pick<Comment, "user_id">,
  userId: string | null,
  isAdmin: boolean,
): boolean {
  if (!userId) return false;
  return isAdmin || comment.user_id === userId;
}

/** Sắp xếp cũ → mới để đọc theo dòng thời gian tự nhiên (không đột biến mảng gốc). */
export function sortComments(comments: Comment[]): Comment[] {
  return [...comments].sort((a, b) => a.created_at - b.created_at);
}

/** Chuẩn hoá khoá từ (reading rỗng → null) để so khớp nhất quán ở client. */
export function wordKey(
  term_lang: string,
  native_lang: string,
  term: string,
  reading?: string | null,
): WordKey {
  return { term_lang, native_lang, term, reading: reading?.trim() || null };
}
