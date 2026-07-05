// Client cho đóng góp từ điển chung (#70 — 6.1). User đề xuất một từ; admin xem
// danh sách chờ + duyệt/từ chối. Gọi kèm Bearer token.

import { authToken } from "@/features/auth/data/auth";

async function authed<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
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

export interface ProposalPayload {
  term: string;
  reading?: string;
  term_lang: string;
  native_lang: string;
  gloss: string[];
  pos?: string[];
}

export interface Proposal {
  id: string;
  proposed_by: string;
  term_lang: string;
  native_lang: string;
  term: string;
  reading: string | null;
  gloss: string[];
  pos: string[];
  status: string;
  created_at: number;
}

/** User: đề xuất một từ lên từ điển hệ thống (chờ admin duyệt). */
export async function proposeWord(payload: ProposalPayload): Promise<void> {
  await authed("/contribute", "POST", payload);
}

/** Admin: danh sách đề xuất chờ duyệt. */
export function listPendingProposals(): Promise<Proposal[]> {
  return authed<Proposal[]>("/contribute/pending", "GET");
}

/** Admin: duyệt (vào từ điển hệ thống). */
export async function approveProposal(id: string): Promise<void> {
  await authed(`/contribute/${id}/approve`, "POST", {});
}

/** Admin: từ chối. */
export async function rejectProposal(id: string): Promise<void> {
  await authed(`/contribute/${id}/reject`, "POST", {});
}
