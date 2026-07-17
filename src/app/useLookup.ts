// Lookup orchestration for the main screen (SPEC 4.1). Owns the detail-panel
// view state and the three ways a detail opens:
//   • onResult    — a confirmed search result (counts as a lookup)
//   • lookup      — following an internal dictionary link (counts as a lookup)
//   • onSelectTag — clicking a Word-Cloud tag: shows the saved personal data and
//                   the dictionary definitions side by side (read-only, does NOT
//                   count as a lookup)
// Kept out of <App> so the shell stays a thin composition root.

import { useState } from "react";
import { VocabEntry } from "@/shared/types";
import { LangPair, pairById, pairId } from "@/shared/languages";
import { sensesToLines, glossaryToLines } from "@/shared/structured-content";
import { TermResult, LookupErrorKind, findTermsRouted, findFuzzyRouted } from "@/features/dictionary/data/search";
import { DictSource } from "@/features/dictionary/domain/source";
import { LookupInput } from "@/features/review/domain/lookup";

export type DetailView = {
  kind: "detail";
  /** Surface form the user searched. */
  term: string;
  /** The term we track in the SRS (dictionary form when deinflected). */
  primaryTerm: string;
  results: TermResult[];
  term_lang: string;
  native_lang: string;
  /**
   * Lỗi khi tra (mất mạng / máy chủ lỗi), null khi tra được. Để UI hiện thông
   * điệp riêng thay vì "Không tìm thấy" khi results rỗng chỉ vì mất mạng.
   */
  error: LookupErrorKind | null;
} | null;

/** The slice of the app store this hook needs (interface segregation). */
interface LookupRecorder {
  recordLookup: (input: Omit<LookupInput, "user_id">) => Promise<VocabEntry>;
}

export function useLookup(store: LookupRecorder, pair: LangPair, source: DictSource) {
  const [view, setView] = useState<DetailView>(null);

  // A search result was confirmed. Like Yomitan, we track the *dictionary form*
  // of a deinflected match (not the inflected surface typed) so the SRS and word
  // cloud key on the lemma.
  async function onResult(
    results: TermResult[],
    term: string,
    p: LangPair,
    error: LookupErrorKind | null = null,
  ) {
    const primary = results[0]?.entry;
    const term_lang = primary?.term_lang ?? p.source;
    const native_lang = primary?.native_lang ?? p.target;
    const primaryTerm = primary?.term ?? term;
    setView({ kind: "detail", term, primaryTerm, results, term_lang, native_lang, error });

    // Lỗi mạng thì bỏ qua near-miss: cùng máy chủ nên cũng sẽ lỗi, và ta không
    // muốn phủ thêm gợi ý lên thông điệp lỗi.
    if (error) return;

    // Fuzzy near-misses ("did you mean…") run off the hot path: scanning the
    // whole dictionary can take a moment, so we never make the exact results
    // wait on it. When it resolves we append, but only if the user is still
    // looking at this exact result set (no newer search/append has replaced it).
    // A one-character query has no meaningful typo near-miss (its "near-misses"
    // are just longer words that contain it — a single kanji lands on its Chữ Hán
    // page instead, which lists those words as examples), so we skip fuzzy there.
    if ([...term].length <= 1) return;
    const exclude = new Set(results.map((r) => JSON.stringify([r.entry.term, r.entry.reading ?? ""])));
    void findFuzzyRouted(term, p, exclude, source).then((fuzzy) => {
      if (!fuzzy.length) return;
      setView((prev) =>
        prev?.kind === "detail" && prev.term === term && prev.results === results
          ? { ...prev, results: [...prev.results, ...fuzzy] }
          : prev,
      );
    });

    // A lookup no longer counts on its own: showing results is not proof the user
    // found what they meant (a list of near-misses tells us nothing). The user
    // confirms the right entry with its "+" (addResult); only then do we record.
  }

  // The user picked one of the shown results as the match they wanted ("+",
  // SPEC 4.4): record it against the history map. Works for exact and fuzzy
  // results alike — we key on the entry's own dictionary form, not the surface
  // typed. No confirmation: the click *is* the confirmation.
  async function addResult(res: TermResult) {
    const e = res.entry;
    const lines = sensesToLines(e.senses);
    const meaning = JSON.stringify(lines.length ? lines : glossaryToLines(e.definitions));
    // Part-of-speech: the sense tags, resolved to their full names when known.
    const posCodes = [...new Set((e.senses ?? []).flatMap((s) => s.tags))];
    const pos = posCodes.map((c) => e.tagMeta?.[c]?.name ?? c).join(", ");
    await store.recordLookup({
      term: e.term,
      term_lang: e.term_lang,
      native_lang: e.native_lang,
      meaning,
      reading: e.reading,
      pos: pos || undefined,
      is_custom: false,
    });
  }

  // Navigate to another term from an internal dictionary link.
  async function lookup(term: string) {
    const { results, error } = await findTermsRouted(term, pair, source);
    await onResult(results, term, pair, error);
  }

  async function onSaveCustom(meaning: string) {
    if (view?.kind !== "detail") return;
    await store.recordLookup({
      term: view.primaryTerm,
      term_lang: view.term_lang,
      native_lang: view.native_lang,
      meaning: JSON.stringify([meaning]),
      is_custom: true,
    });
    // The saved definition shows immediately via the learning entry's meaning.
  }

  // Open a single kanji's Chữ Hán page (from the kanji-stats grid). Kanji live
  // in their own database, independent of the chosen dictionary source/pair, so
  // we always resolve under Nhật→Việt: the empty results render the KanjiBreakdown,
  // and a kanji that is also a headword still shows its entry. Not a lookup.
  async function lookupKanji(kanji: string) {
    const jaPair = pairById(pairId("ja", "vi"));
    setView({ kind: "detail", term: kanji, primaryTerm: kanji, results: [], term_lang: "ja", native_lang: "vi", error: null });
    const { results, error } = await findTermsRouted(kanji, jaPair, source);
    setView((prev) =>
      prev?.kind === "detail" && prev.term === kanji && prev.results.length === 0
        ? { ...prev, results, error }
        : prev,
    );
  }

  // Mở chi tiết một từ ở chế độ chỉ-đọc (KHÔNG đếm lượt tra). Dùng chung cho: bấm
  // một thẻ Word Cloud, và bấm một ô ở trang học từ vựng — xem nghĩa mà không làm
  // "quên" từ đó. Tra dưới cặp ngôn ngữ của chính từ đó (thẻ/list có thể thuộc cặp
  // khác với cặp đang chọn trên header).
  async function openWord(w: { term: string; term_lang: string; native_lang: string }) {
    setView({
      kind: "detail",
      term: w.term,
      primaryTerm: w.term,
      results: [],
      term_lang: w.term_lang,
      native_lang: w.native_lang,
      error: null,
    });
    const tagPair = pairById(pairId(w.term_lang, w.native_lang));
    const { results, error } = await findTermsRouted(w.term, tagPair, source);
    // Attach the results only if the user is still on this exact word (they may
    // have opened another card while the search ran).
    setView((prev) =>
      prev?.kind === "detail" && prev.term === w.term && prev.results.length === 0
        ? { ...prev, results, error }
        : prev,
    );
  }

  // Selecting a cloud tag maps the word to its meaning (read-only) — một trường
  // hợp đặt biệt của openWord, vì entry mang sẵn đủ trường.
  async function onSelectTag(entry: VocabEntry) {
    await openWord(entry);
  }

  // Fetch dictionary definitions for a saved entry without opening the detail
  // panel — used by the review card's "Xem định nghĩa từ điển" button. Searches
  // under the entry's *own* language pair (a card may belong to a pair other than
  // the one currently selected) and never counts as a lookup.
  async function lookupDetails(entry: VocabEntry): Promise<TermResult[]> {
    const tagPair = pairById(pairId(entry.term_lang, entry.native_lang));
    // Thẻ ôn chỉ hiện phần định nghĩa; lỗi mạng ở đây coi như không có định nghĩa.
    const { results } = await findTermsRouted(entry.term, tagPair, source);
    return results;
  }

  return { view, onResult, lookup, lookupKanji, onSaveCustom, onSelectTag, openWord, addResult, closeView: () => setView(null), lookupDetails };
}
