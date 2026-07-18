// Dictionary sources behind a single interface, so the lookup orchestration
// (search.ts) only picks a source and never branches on where the data lives.
// Two implementations:
//   • localSource  — IndexedDB (imported Yomitan dictionaries), rich entries.
//   • serverSource — the Postgres fallback dictionary, plain-text entries.
// Both deinflect Japanese the same way (local does it inside findTerms; the
// server is dumb, so we deinflect client-side and look each candidate up).

import { DictEntry } from "@/shared/db";
import { LangPair } from "@/shared/languages";
import { candidates } from "../domain/deinflect";
import { found, lookupFailed, LookupResult } from "../domain/lookupError";
import { mergeDeinflectedHits } from "../domain/serverMerge";
import { DictSource } from "../domain/source";
import { findTerms, fuzzyTerms, suggestTerms, TermResult } from "./yomitan";
import { DictionaryNetworkError, serverFuzzy, serverLookup, serverSuggest } from "./serverDict";

/** Forward, per-pair look-up against one database. No cross-source fallback. */
export interface DictionarySource {
  /**
   * Yomitan-style: deinflect the query and return ranked matches. Bọc trong
   * LookupResult để phân biệt "không có từ" (results rỗng, error null) với "không
   * gọi được máy chủ" (error "network") — UI báo hai trường hợp khác nhau.
   */
  findTerms(text: string, pair: LangPair): Promise<LookupResult<TermResult>>;
  /** Prefix suggestions while typing. */
  suggest(prefix: string, pair: LangPair): Promise<DictEntry[]>;
  /** Near-misses by edit distance, skipping the `exclude`d (term, reading) keys. */
  fuzzy(text: string, pair: LangPair, exclude: Set<string>): Promise<TermResult[]>;
}

const localSource: DictionarySource = {
  // Nguồn Trên máy chạy hoàn toàn từ IndexedDB (offline) nên không có lỗi mạng.
  findTerms: async (text, pair) => found(await findTerms(text, pair.source, pair.target)),
  suggest: (prefix, pair) => suggestTerms(prefix, pair.source, pair.target),
  fuzzy: (text, pair, exclude) => fuzzyTerms(text, pair.source, pair.target, exclude),
};

/** Cap the number of network look-ups when deinflecting against the server. */
const MAX_SERVER_CANDIDATES = 12;

/** (term, reading) key matching findTerms/fuzzyTerms — for cross-source dedupe. */
function termReadingKey(entry: DictEntry): string {
  return JSON.stringify([entry.term, entry.reading ?? ""]);
}

const serverSource: DictionarySource = {
  async findTerms(text, pair) {
    const query = text.trim();
    if (!query) return found([]);
    // The server can't deinflect, so look each candidate form up. These are
    // independent round-trips (was up to 12 sequential awaits — noticeably slow
    // on a strongly inflected word) → fire them in parallel. Promise.all giữ
    // đúng thứ tự ứng viên nên khâu gộp vẫn "first-wins" như trước.
    const cands = candidates(query, pair.source).slice(0, MAX_SERVER_CANDIDATES);
    try {
      const hits = await Promise.all(
        cands.map(async (cand) => ({
          reasons: cand.reasons,
          entries: await serverLookup(cand.term, pair.source, pair.target),
        })),
      );
      // A form can map to several entries (homographs sharing a reading:
      // さくら → 桜, 櫻); mergeDeinflectedHits keys by (term, reading) so they
      // surface separately, keeps the closest match, and ranks the result.
      return found(mergeDeinflectedHits(hits, query));
    } catch (err) {
      // Mất mạng / máy chủ lỗi: KHÔNG trả rỗng-im-lặng (UI sẽ tưởng "không tìm
      // thấy"). Báo cờ lỗi để UI hiện thông điệp riêng + gợi ý chuyển nguồn.
      if (err instanceof DictionaryNetworkError) return lookupFailed("network");
      throw err;
    }
  },

  suggest: (prefix, pair) => serverSuggest(prefix, pair.source, pair.target),

  async fuzzy(text, pair, exclude) {
    const query = text.trim();
    if (!query) return [];
    // The server (Postgres `levenshtein`) already ranks closest-first and bounds
    // the distance; we just drop anything already shown as an exact match.
    const entries = await serverFuzzy(query, pair.source, pair.target);
    return entries
      .filter((e) => !exclude.has(termReadingKey(e)))
      .map((entry) => ({ entry, reasons: [], source: query, fuzzy: true }));
  },
};

/** The source the user has selected. */
export function getSource(source: DictSource): DictionarySource {
  return source === "server" ? serverSource : localSource;
}
