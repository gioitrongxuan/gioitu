// Client cho bình luận / góp ý của người dùng trên một từ (#23). Đọc công khai;
// thêm/xoá kèm Bearer token. Facade mỏng quanh /api/comments — logic thuần ở
// domain/comment.ts.

import { authToken } from "@/features/auth/data/auth";
import type { Comment, WordKey } from "../domain/comment";

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

function queryString(key: WordKey): string {
  const params = new URLSearchParams({
    term_lang: key.term_lang,
    native_lang: key.native_lang,
    term: key.term,
  });
  if (key.reading) params.set("reading", key.reading);
  return params.toString();
}

/** Đọc bình luận đang hiển thị của một từ (guest đọc được). */
export function listComments(key: WordKey): Promise<Comment[]> {
  return request<Comment[]>(`/comments?${queryString(key)}`, "GET");
}

/** Thêm bình luận (cần đăng nhập). Trả về bản ghi vừa tạo. */
export function addComment(key: WordKey, body: string): Promise<Comment> {
  return request<Comment>("/comments", "POST", { ...key, body });
}

/** Xoá bình luận của mình (admin xoá bất kỳ). */
export async function deleteComment(id: string): Promise<void> {
  await request(`/comments/${encodeURIComponent(id)}`, "DELETE");
}
