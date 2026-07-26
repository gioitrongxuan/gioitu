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

/** Số bình luận mỗi lượt tải: trang đầu là mới nhất, "Xem thêm" kéo tiếp phần cũ hơn. */
export const COMMENTS_PAGE_SIZE = 10;

/**
 * Mốc của bình luận cũ nhất đã tải, để xin phần cũ hơn nó. Dùng con trỏ thay vì
 * OFFSET để bình luận gửi giữa chừng không làm lệch trang; kèm `id` phòng khi
 * hai bình luận trùng mốc thời gian (nếu không sẽ có cái bị nhảy cóc).
 */
export interface CommentCursor {
  created_at: number;
  id: string;
}

/** Một trang bình luận: `items` mới → cũ, `total` là tổng của cả từ. */
export interface CommentPage {
  total: number;
  items: Comment[];
}

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

/** Thứ tự chuẩn: cũ → mới; `id` phá thế hoà để trùng thứ tự con trỏ phân trang. */
function byOldestFirst(a: Comment, b: Comment): number {
  if (a.created_at !== b.created_at) return a.created_at - b.created_at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Sắp xếp cũ → mới để đọc theo dòng thời gian tự nhiên (không đột biến mảng gốc). */
export function sortComments(comments: Comment[]): Comment[] {
  return [...comments].sort(byOldestFirst);
}

/** Con trỏ để xin trang cũ hơn; null khi chưa tải được bình luận nào. */
export function olderCursor(loaded: Comment[]): CommentCursor | null {
  let oldest: Comment | null = null;
  for (const c of loaded) if (!oldest || byOldestFirst(c, oldest) < 0) oldest = c;
  return oldest ? { created_at: oldest.created_at, id: oldest.id } : null;
}

/** Gộp trang vừa tải vào danh sách đang hiện: khử trùng theo id, sắp cũ → mới. */
export function mergeComments(loaded: Comment[], incoming: Comment[]): Comment[] {
  const byId = new Map(loaded.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, c);
  return sortComments([...byId.values()]);
}

/** Số bình luận cũ hơn chưa tải; kẹp ≥ 0 vì bình luận mình vừa gửi vượt `total` cũ. */
export function remainingComments(total: number, loadedCount: number): number {
  return Math.max(0, total - loadedCount);
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
