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
import { TermResult, findTermsRouted } from "@/features/dictionary/data/search";
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

export function useLookup(store: LookupRecorder, pair: LangPair) {
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
    if (primary) {
      const lines = sensesToLines(primary.senses);
      const meaning = JSON.stringify(lines.length ? lines : glossaryToLines(primary.definitions));
      await store.recordLookup({ term: primaryTerm, term_lang, native_lang, meaning, is_custom: false });
    }
    // No result → wait for the user to save a Custom Definition (no count yet).
  }

  // Navigate to another term from an internal dictionary link.
  async function lookup(term: string) {
    const results = await findTermsRouted(term, pair);
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

  // Manually commit the current term to the review queue ("[+]", SPEC 4.4 Case 2):
  // asserts intent to learn, so an SRS card is created immediately, bypassing the
  // lookup-count gate. meaning="" keeps the entry's existing definition.
  async function addToReview() {
    if (view?.kind !== "detail") return;
    await store.recordLookup({
      term: view.primaryTerm,
      term_lang: view.term_lang,
      native_lang: view.native_lang,
      meaning: "",
      manualAdd: true,
    });
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

  return { view, onResult, lookup, onSaveCustom, onSelectTag, addToReview, closeView: () => setView(null) };
}
