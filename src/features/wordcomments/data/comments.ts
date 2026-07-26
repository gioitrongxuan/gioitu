// Client cho bình luận / góp ý của người dùng trên một từ (#23). Đọc công khai;
// thêm/xoá kèm Bearer token. Facade mỏng quanh /api/comments — logic thuần ở
// domain/comment.ts.

import { authToken } from "@/features/auth/data/auth";
import type { Comment, CommentCursor, CommentPage, WordKey } from "../domain/comment";

async function request<T>(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> {
  const token = authToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Yêu cầu thất bại");
  return data as T;
}

export interface ListOptions {
  /** Số bình luận tối đa cho lượt này. */
  limit?: number;
  /** Mốc của bình luận cũ nhất đã có — xin phần cũ hơn nó. Bỏ trống = trang đầu. */
  before?: CommentCursor | null;
}

function queryString(key: WordKey, { limit, before }: ListOptions): string {
  const params = new URLSearchParams({
    term_lang: key.term_lang,
    native_lang: key.native_lang,
    term: key.term,
  });
  if (key.reading) params.set("reading", key.reading);
  if (limit != null) params.set("limit", String(limit));
  if (before) {
    params.set("before_ts", String(before.created_at));
    params.set("before_id", before.id);
  }
  return params.toString();
}

/** Một trang bình luận đang hiển thị của một từ, mới → cũ (guest đọc được). */
export function listComments(key: WordKey, options: ListOptions = {}): Promise<CommentPage> {
  return request<CommentPage>(`/comments?${queryString(key, options)}`, "GET");
}

/** Thêm bình luận (cần đăng nhập). Trả về bản ghi vừa tạo. */
export function addComment(key: WordKey, body: string): Promise<Comment> {
  return request<Comment>("/comments", "POST", { ...key, body });
}

/** Xoá bình luận của mình (admin xoá bất kỳ). */
export async function deleteComment(id: string): Promise<void> {
  await request(`/comments/${encodeURIComponent(id)}`, "DELETE");
}
