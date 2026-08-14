// Phần I/O của luồng tra hộ overlay ngoài trang (#251): chạy lượt tra lần lượt
// qua các nguồn rồi giao cho domain/lookupProxy dựng payload trả về.
//
// Đây là NGOẠI LỆ có chủ đích duy nhất của quy tắc "nguồn nào được chọn thì tra
// đúng nguồn đó" (search.ts): overlay ở origin khác, không đọc được lựa chọn
// nguồn của app — xem PROXY_SOURCE_ORDER. Người dùng tra trong app vẫn đi qua
// search.ts như cũ, không nhánh nào ở đây chạm tới.

import { LangPair } from "@/shared/languages";
import {
  buildLookupReply,
  LookupProxyReply,
  ProxyAttempt,
  PROXY_SOURCE_ORDER,
} from "../domain/lookupProxy";
import { findTermsRouted } from "./search";

/** Tra một từ hộ overlay: trên máy trước, không có mới hỏi server. */
export async function runProxyLookup(term: string, pair: LangPair): Promise<LookupProxyReply> {
  const attempts: ProxyAttempt[] = [];
  for (const source of PROXY_SOURCE_ORDER) {
    // Tuần tự có chủ đích (không Promise.all): từ đã có sẵn trên máy thì không
    // kéo theo lượt gọi mạng nào — overlay bật lên khi người ta đang đọc trang.
    const { results, error } = await findTermsRouted(term, pair, source);
    attempts.push({ source, results, error });
    if (results.length > 0) break;
  }
  return buildLookupReply(term, attempts);
}
