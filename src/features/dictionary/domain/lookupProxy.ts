// Proxy tra cứu cho overlay ngoài trang (#251). Overlay của extension đứng ở
// origin khác nên KHÔNG đọc được IndexedDB của app; nó mở một cửa sổ tí hon
// `<app>/?lookup=<từ>`, app tra hộ rồi postMessage kết quả về và tự đóng — đúng
// khung `?add_ai=1` đã có, chỉ đổi việc phải làm.
//
// Ở đây là phần logic thuần: đọc yêu cầu từ query param, thứ tự nguồn, và rút
// kết quả thành payload gọn để gửi qua postMessage. Phần I/O (gọi findTermsRouted,
// postMessage, đóng cửa sổ) nằm ở App.tsx.

import { LANG_PAIRS, LangPair } from "@/shared/languages";
import type { TermResult } from "../data/yomitan";
import { LookupErrorKind } from "./lookupError";
import { guessPairForText } from "./quickadd";
import { resultGloss } from "./results";
import { DictSource } from "./source";

/** Toàn bộ query param của luồng ?lookup= — App xoá sạch khỏi URL sau khi đọc. */
export const LOOKUP_PARAM_KEYS = ["lookup", "lookup_pair", "lookup_origin"] as const;

export interface LookupProxyRequest {
  /** Mặt chữ cần tra (đã trim). */
  term: string;
  pair: LangPair;
  /** Origin của trang đã mở cửa sổ này — đích targetOrigin khi postMessage. */
  openerOrigin: string | null;
}

/**
 * Đọc yêu cầu tra hộ từ query param. Khác `?add=`, mặt chữ rỗng không phải một
 * yêu cầu hợp lệ (không có form nào để mở, tra chuỗi rỗng thì vô nghĩa) → null.
 * `lookup_pair` không hợp lệ thì đoán lại theo chữ viết như luồng thêm nhanh.
 */
export function parseLookupParams(params: URLSearchParams): LookupProxyRequest | null {
  const term = (params.get("lookup") ?? "").trim();
  if (!term) return null;
  const pairParam = params.get("lookup_pair");
  const pair = LANG_PAIRS.find((p) => p.id === pairParam) ?? guessPairForText(term);
  return { term, pair, openerOrigin: params.get("lookup_origin") };
}

/**
 * Ngoại lệ local-first, CHỈ dành cho luồng proxy này: app tra đúng nguồn người
 * dùng chọn (`domain/source.ts`), nhưng overlay ở origin khác không đọc được
 * lựa chọn ấy, nên nó hỏi từ điển trên máy trước — nhanh và chạy cả khi offline
 * — hết mới nhờ server. Chốt với chủ dự án ở #251.
 */
export const PROXY_SOURCE_ORDER: readonly DictSource[] = ["local", "server"];

/** Một lượt tra đã chạy xong ở một nguồn (kết quả + cờ lỗi của LookupResult). */
export interface ProxyAttempt {
  source: DictSource;
  results: TermResult[];
  error: LookupErrorKind | null;
}

/** Một dòng kết quả gọn cho overlay — nó chỉ có chỗ hiện mặt chữ, cách đọc, nghĩa. */
export interface ProxyHit {
  term: string;
  reading: string;
  gloss: string;
}

/** Overlay là cái thẻ nhỏ cạnh con trỏ: quá vài dòng là tràn màn hình người đọc. */
export const MAX_PROXY_HITS = 5;

/**
 * Rút kết quả tra thành các dòng gọn. Gộp trùng theo (mặt chữ, cách đọc) vì một
 * từ có thể nằm trong nhiều từ điển đã cài — overlay không phân biệt nguồn nên
 * hiện lặp chỉ tổ chiếm chỗ; giữ bản đầu tiên (đã xếp hạng sẵn).
 */
export function toProxyHits(results: readonly TermResult[], limit = MAX_PROXY_HITS): ProxyHit[] {
  const seen = new Set<string>();
  const hits: ProxyHit[] = [];
  for (const res of results) {
    if (hits.length >= limit) break;
    const { term, reading = "" } = res.entry;
    const key = JSON.stringify([term, reading]);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ term, reading, gloss: resultGloss(res.entry) });
  }
  return hits;
}

export const LOOKUP_REPLY_KIND = "gioitu-lookup";

/**
 * Vì sao proxy không trả được kết quả: lỗi của chính lượt tra ("network"), hoặc
 * trục trặc bất ngờ ("failed" — IndexedDB không mở được, ngoại lệ ngoài dự tính).
 * Hai thứ đều KHÔNG được rơi về "không có từ" ở overlay.
 */
export type ProxyErrorKind = LookupErrorKind | "failed";

/** Payload postMessage về overlay. Chỉ dữ liệu thuần — nó đi qua ranh giới origin. */
export interface LookupProxyReply {
  kind: typeof LOOKUP_REPLY_KIND;
  term: string;
  hits: ProxyHit[];
  /** Nguồn đã trả kết quả; null khi không nguồn nào có từ. */
  source: DictSource | null;
  /** Chỉ đặt khi không tìm được gì VÀ có nguồn hỏng — overlay báo khác "không có từ". */
  error?: ProxyErrorKind;
}

/**
 * Chọn nguồn nào được trả lời: nguồn đầu tiên có kết quả thắng, đúng tinh thần
 * "local trước, hết mới hỏi server". Không nguồn nào có từ mà lượt tra lại hỏng
 * (mất mạng khi hỏi server) thì kèm cờ lỗi — im lặng báo "không có từ" lúc rớt
 * mạng chính là cái bẫy `lookupError.ts` sinh ra để tránh.
 */
export function buildLookupReply(
  term: string,
  attempts: readonly ProxyAttempt[],
  limit = MAX_PROXY_HITS,
): LookupProxyReply {
  const hit = attempts.find((a) => a.results.length > 0);
  if (hit) {
    return { kind: LOOKUP_REPLY_KIND, term, hits: toProxyHits(hit.results, limit), source: hit.source };
  }
  const failed = attempts.find((a) => a.error != null);
  const reply: LookupProxyReply = { kind: LOOKUP_REPLY_KIND, term, hits: [], source: null };
  if (failed?.error) reply.error = failed.error;
  return reply;
}

/** Lượt tra ném ngoại lệ: vẫn phải trả lời overlay, nhưng nói rõ là hỏng chứ không rỗng. */
export function failedLookupReply(term: string): LookupProxyReply {
  return { kind: LOOKUP_REPLY_KIND, term, hits: [], source: null, error: "failed" };
}
