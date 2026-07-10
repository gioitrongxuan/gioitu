// Study list API client (auth-protected). Bộ sưu tập từ của người dùng (song song
// SRS). Thêm từ bằng cách gửi term/reading — server tự giải word_id của từ điển.

import { authToken } from "@/features/auth/data/auth";

const BASE = "/api/studylist";

export interface StudyListSummary {
  id: string;
  name: string;
  isPublic: boolean;
  wordCount: number;
  createdAt: number;
  modifiedAt: number;
}
export interface StudyListWordView {
  wordId: string;
  base: string;
  reading?: string;
  furigana?: string;
  /** Cặp ngôn ngữ của từ (lấy từ word) — để overlay tiến độ SRS theo (term, term_lang). */
  term_lang: string;
  native_lang: string;
  addedAt: number;
}
export interface StudyListDetail extends StudyListSummary {
  words: StudyListWordView[];
}

function authHeaders(): Record<string, string> {
  const token = authToken();
  if (!token) throw new Error("Cần đăng nhập để dùng danh sách học");
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new Error("Không kết nối được tới máy chủ");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Yêu cầu thất bại");
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...authHeaders() },
  body: JSON.stringify(body),
});

export function listMine(): Promise<StudyListSummary[]> {
  return request<StudyListSummary[]>("/", { headers: authHeaders() });
}

export function createList(name: string): Promise<{ id: string }> {
  return request<{ id: string }>("/", json({ name }));
}

export function getList(id: string): Promise<StudyListDetail> {
  return request<StudyListDetail>(`/${encodeURIComponent(id)}`, { headers: authHeaders() });
}

export function renameList(id: string, name: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ name }),
  });
}

export function deleteList(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
}

export interface WordRef {
  term: string;
  reading?: string;
  term_lang: string;
  native_lang: string;
}

export function addWord(listId: string, word: WordRef): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/${encodeURIComponent(listId)}/words`, json(word));
}

export function removeWord(listId: string, wordId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/${encodeURIComponent(listId)}/words/${encodeURIComponent(wordId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

/** Các list của người dùng có chứa từ này (cờ "marked"). */
export function markedFor(word: WordRef): Promise<{ id: string; name: string }[]> {
  const q = new URLSearchParams({ term: word.term, src: word.term_lang, tgt: word.native_lang });
  if (word.reading) q.set("reading", word.reading);
  return request<{ id: string; name: string }[]>(`/marked?${q}`, { headers: authHeaders() });
}
