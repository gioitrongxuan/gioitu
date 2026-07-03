// Dictionary-management API client (auth-protected, server-backed).
//
// Unlike `api.ts` (best-effort, swallows errors and falls back to IndexedDB),
// these admin calls are explicit actions in the management screen, so they
// surface backend errors to the caller instead of returning null.

import { DictEntry } from "@/shared/db";
import type { EditableImage, EditableSense, EditableTerm, TermEditState } from "@/shared/dictionary";
import { authToken } from "@/features/auth/data/auth";

const BASE = "/api";

export interface DictionaryMeta {
  id: string;
  title: string;
  term_lang: string;
  native_lang: string;
  created_at: number;
  term_count: number;
}

export interface ImportResult {
  dict_id: string;
  title: string;
  termCount: number;
  term_lang: string;
  native_lang: string;
}

export interface TermRow extends DictEntry {
  /** Source dictionary id, or null for seed / manually added terms. */
  dict_id: string | null;
}

export interface TermsPage {
  total: number;
  items: TermRow[];
}

function authHeaders(): Record<string, string> {
  const token = authToken();
  if (!token) throw new Error("Cần đăng nhập để quản lý từ điển");
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new Error("Không kết nối được tới máy chủ (backend chưa chạy?)");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Yêu cầu thất bại");
  }
  return data as T;
}

/** Upload a Yomitan .zip to the backend. Pair override is optional. */
export function importDictionary(
  file: Blob,
  opts: { term_lang?: string; native_lang?: string } = {},
): Promise<ImportResult> {
  const q = new URLSearchParams();
  if (opts.term_lang) q.set("src", opts.term_lang);
  if (opts.native_lang) q.set("tgt", opts.native_lang);
  const suffix = q.toString() ? `?${q}` : "";
  return request<ImportResult>(`/dict/import${suffix}`, {
    method: "POST",
    headers: { "Content-Type": "application/zip", ...authHeaders() },
    body: file,
  });
}

/** Ask the backend to download and import a Yomitan .zip from a URL. */
export function importDictionaryUrl(
  url: string,
  opts: { term_lang?: string; native_lang?: string } = {},
): Promise<ImportResult> {
  return request<ImportResult>("/dict/import-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ url, src: opts.term_lang, tgt: opts.native_lang }),
  });
}

export function listDictionaries(): Promise<DictionaryMeta[]> {
  return request<DictionaryMeta[]>("/dict/dictionaries", { headers: authHeaders() });
}

export function deleteDictionary(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/dict/dictionaries/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export function browseTerms(
  term_lang: string,
  native_lang: string,
  opts: { q?: string; limit?: number; offset?: number } = {},
): Promise<TermsPage> {
  const q = new URLSearchParams({ src: term_lang, tgt: native_lang });
  if (opts.q) q.set("q", opts.q);
  if (opts.limit != null) q.set("limit", String(opts.limit));
  if (opts.offset != null) q.set("offset", String(opts.offset));
  return request<TermsPage>(`/dict/terms?${q}`, { headers: authHeaders() });
}

/** Toàn bộ trạng thái sửa được của một từ (kèm id lexeme để lưu đúng chỗ). */
export function fetchTermForEdit(
  term_lang: string,
  native_lang: string,
  term: string,
  reading?: string,
): Promise<TermEditState> {
  const q = new URLSearchParams({ src: term_lang, tgt: native_lang, term });
  if (reading) q.set("reading", reading);
  return request<TermEditState>(`/dict/term/edit?${q}`, { headers: authHeaders() });
}

/** Thêm/sửa một từ. `word_id` (khi sửa) đảm bảo ghi đúng lexeme kể cả khi đổi reading. */
export function saveTerm(entry: EditableTerm & { word_id?: string }): Promise<{ ok: true }> {
  return request<{ ok: true }>("/dict/term", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(entry),
  });
}

export function deleteTerm(
  term: string,
  term_lang: string,
  native_lang: string,
): Promise<{ ok: true }> {
  return request<{ ok: true }>("/dict/term", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ term, term_lang, native_lang }),
  });
}

/** Bật/tắt cờ kiểm duyệt của một từ (tích xanh cạnh từ khi tra). */
export function setTermVerified(wordId: string, verified: boolean): Promise<{ ok: true; verified: boolean }> {
  return request<{ ok: true; verified: boolean }>("/dict/term/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ word_id: wordId, verified }),
  });
}

/**
 * Ghi đè nghĩa của MỘT nguồn đã nhập (một dòng entry). Senses rỗng = gỡ nguồn
 * đó khỏi từ; `deleted` báo lại để UI biết nguồn đã biến mất.
 */
export function saveEntrySenses(
  entryId: string,
  senses: EditableSense[],
): Promise<{ ok: true; deleted: boolean }> {
  return request<{ ok: true; deleted: boolean }>("/dict/term/entry", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ entry_id: entryId, senses }),
  });
}

/** Thêm một ảnh minh hoạ cho từ (dán URL). Trả về ảnh đã lưu (kèm id để gỡ). */
export function addTermImage(wordId: string, url: string): Promise<EditableImage> {
  return request<EditableImage>("/dict/term/image", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ word_id: wordId, url }),
  });
}

export function deleteTermImage(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/dict/term/image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ id }),
  });
}

export function deleteTermComment(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/dict/term/comment", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ id }),
  });
}
