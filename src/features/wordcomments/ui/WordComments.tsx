// Bình luận / góp ý của người dùng cho một từ (#23), đặt dưới phần nghĩa trong
// panel kết quả tra từ. Guest đọc được; đăng nhập mới viết/xoá được (admin xoá
// bất kỳ). Tải theo trang: mở panel thấy ngay phần mới nhất, "Xem thêm" kéo dần
// phần cũ hơn. Logic thuần (kiểm tra, quyền xoá, gộp trang) ở domain/comment.ts.

import { useEffect, useState } from "react";
import { addComment, deleteComment, listComments } from "../data/comments";
import { Skeleton } from "@/shared/ui/Skeleton";
import { TrashIcon } from "@/shared/ui/icons";
import {
  COMMENTS_PAGE_SIZE,
  canDeleteComment,
  mergeComments,
  olderCursor,
  remainingComments,
  sortComments,
  validateComment,
  wordKey,
  type Comment,
} from "../domain/comment";

interface Props {
  term: string;
  reading?: string | null;
  termLang: string;
  nativeLang: string;
  /** Id tài khoản hiện tại (guest → không khớp bình luận nào). */
  currentUserId?: string | null;
  /** Đã đăng nhập (mới được viết/xoá). */
  loggedIn?: boolean;
  /** Admin từ điển: xoá được bình luận của bất kỳ ai. */
  isAdmin?: boolean;
  /** Mời đăng nhập khi guest muốn bình luận. */
  onRequireLogin?: () => void;
}

/** "x phút/giờ/ngày trước" cho mốc quá khứ; xa hơn thì hiện ngày. */
function formatWhen(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút trước`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(ts).toLocaleDateString("vi-VN");
}

export function WordComments({
  term,
  reading,
  termLang,
  nativeLang,
  currentUserId,
  loggedIn,
  isAdmin,
  onRequireLogin,
}: Props) {
  const key = wordKey(termLang, nativeLang, term, reading);
  const [comments, setComments] = useState<Comment[]>([]);
  /** Tổng bình luận của từ trên server — để biết còn bao nhiêu cái cũ hơn chưa tải. */
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Tải lại khi đổi từ. Cờ `alive` chặn set state khi kết quả về sau đã đổi từ.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listComments(key, { limit: COMMENTS_PAGE_SIZE })
      .then((page) => {
        if (!alive) return;
        setComments(sortComments(page.items));
        setTotal(page.total);
      })
      .catch(() => {
        if (alive) setError("Không tải được bình luận");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // Khoá phụ thuộc theo các trường của từ (key là object mới mỗi render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termLang, nativeLang, term, reading]);

  async function loadOlder() {
    setLoadingOlder(true);
    setError(null);
    try {
      const page = await listComments(key, {
        limit: COMMENTS_PAGE_SIZE,
        before: olderCursor(comments),
      });
      const merged = mergeComments(comments, page.items);
      setComments(merged);
      // Về ít hơn mức xin nghĩa là đã chạm đáy: chốt tổng theo số đã tải, đừng
      // giữ `total` mới (nó có thể vừa tăng vì bình luận MỚI của người khác —
      // thứ mà nút "xem phần cũ hơn" này không bao giờ với tới).
      setTotal(page.items.length < COMMENTS_PAGE_SIZE ? merged.length : page.total);
    } catch {
      setError("Không tải được bình luận cũ hơn");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function submit() {
    const check = validateComment(draft);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await addComment(key, check.body);
      setComments((prev) => mergeComments(prev, [created]));
      setTotal((n) => n + 1);
      setDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
      setTotal((n) => Math.max(0, n - 1));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const olderCount = remainingComments(total, comments.length);

  return (
    <section className="word-comments">
      <p className="section-label">Bình luận / góp ý{total > 0 && ` (${total})`}</p>

      {loading ? (
        <Skeleton lines={2} />
      ) : comments.length === 0 ? (
        // Tải lỗi thì im lặng nhường chỗ cho thông báo lỗi ở cuối khu: chưa đọc
        // được khác hẳn với "chưa ai bình luận".
        !error && <p className="muted">Chưa có bình luận. Hãy là người đầu tiên góp ý.</p>
      ) : (
        <>
          {/* Phần cũ hơn nằm phía trên dòng thời gian nên nút tải cũng đứng trên
              danh sách — bấm xong nội dung mọc lên, chỗ đang đọc không bị đẩy. */}
          {loadingOlder ? (
            <Skeleton lines={2} />
          ) : (
            olderCount > 0 && (
              <button
                className="link comment-more"
                title="Tải thêm bình luận cũ hơn"
                onClick={loadOlder}
              >
                Xem thêm ({olderCount})
              </button>
            )
          )}
          <ul className="comment-list">
            {comments.map((c) => (
              <li key={c.id} className="comment">
                <div className="comment-meta">
                  <span className="comment-author">{c.author_name}</span>
                  <span className="comment-when">{formatWhen(c.created_at)}</span>
                  {canDeleteComment(c, currentUserId ?? null, isAdmin === true) && (
                    <button
                      className="link comment-del"
                      title="Xoá bình luận"
                      aria-label="Xoá bình luận"
                      onClick={() => remove(c.id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </div>
                <p className="comment-body">{c.body}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {loggedIn ? (
        <div className="comment-form">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Viết góp ý cho từ này…"
            rows={3}
          />
          <button className="primary" disabled={busy || !draft.trim()} onClick={submit}>
            Gửi bình luận
          </button>
        </div>
      ) : (
        <button className="link" onClick={() => onRequireLogin?.()}>
          Đăng nhập để bình luận
        </button>
      )}

      {error && <p className="danger comment-error">{error}</p>}
    </section>
  );
}
