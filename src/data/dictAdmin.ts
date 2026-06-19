// Dictionary-management API client (auth-protected, server-backed).
//
// Unlike `api.ts` (best-effort, swallows errors and falls back to IndexedDB),
// these admin calls are explicit actions in the management screen, so they
// surface backend errors to the caller instead of returning null.

import { DictEntry } from "./db";
import { authToken } from "./auth";

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

export function saveTerm(entry: {
  term: string;
  term_lang: string;
  native_lang: string;
  reading?: string;
  definitions: string[];
}): Promise<DictEntry> {
  return request<DictEntry>("/dict/term", {
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
