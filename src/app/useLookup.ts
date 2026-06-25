// Lookup orchestration for the main screen (SPEC 4.1). Owns the detail-panel
// view state and the three ways a detail opens:
//   • onResult    — a confirmed search result (counts as a lookup)
//   • lookup      — following an internal dictionary link (counts as a lookup)
//   • onSelectTag — clicking a Word-Cloud tag (read-only, does NOT count)
// Kept out of <App> so the shell stays a thin composition root.

import { useState } from "react";
import { VocabEntry } from "@/shared/types";
import { LangPair } from "@/shared/languages";
import { sensesToLines, glossaryToLines } from "@/shared/structured-content";
import { TermResult, findTermsRouted, findFuzzyRouted } from "@/features/dictionary/data/search";
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
  async function onResult(results: TermResult[], term: string, p: LangPair) {
    const primary = results[0]?.entry;
    const term_lang = primary?.term_lang ?? p.source;
    const native_lang = primary?.native_lang ?? p.target;
    const primaryTerm = primary?.term ?? term;
    setView({ kind: "detail", term, primaryTerm, results, term_lang, native_lang });

    // Fuzzy near-misses ("did you mean…") run off the hot path: scanning the
    // whole dictionary can take a moment, so we never make the exact results
    // wait on it. When it resolves we append, but only if the user is still
    // looking at this exact result set (no newer search/append has replaced it).
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
    const results = await findTermsRouted(term, pair, source);
    await onResult(results, term, pair);
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

  // Selecting a cloud tag opens a read-only detail (does NOT count as a lookup).
  function onSelectTag(entry: VocabEntry) {
    setView({
      kind: "detail",
      term: entry.term,
      primaryTerm: entry.term,
      results: [],
      term_lang: entry.term_lang,
      native_lang: entry.native_lang,
    });
  }

  return { view, onResult, lookup, onSaveCustom, onSelectTag, addResult, closeView: () => setView(null) };
}
