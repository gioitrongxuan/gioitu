// Top-level app: Search Bar → Word Cloud → Filter Bar (SPEC 3), plus the
// detail/reverse panels, the review session, and dictionary import.

import { useState } from "react";
import { useAppStore } from "./ui/store";
import { SearchBar, SearchDirection } from "./ui/SearchBar";
import { WordCloud } from "./ui/WordCloud";
import { FilterBar } from "./ui/FilterBar";
import { DetailPanel } from "./ui/DetailPanel";
import { ReverseResults } from "./ui/ReverseResults";
import { ReviewSession } from "./ui/ReviewSession";
import { DictionaryImport } from "./ui/DictionaryImport";
import { Toasts } from "./ui/Toasts";
import { AuthScreen } from "./ui/AuthScreen";
import { useAuth } from "./ui/useAuth";
import { DictEntry } from "./data/db";
import { VocabEntry } from "./domain/types";
import { CloudSort } from "./domain/wordcloud";

const DEFAULT_TERM_LANG = "en";
const DEFAULT_NATIVE_LANG = "vi";

type View =
  | { kind: "detail"; term: string; term_lang: string; native_lang: string; dict: DictEntry | null }
  | { kind: "reverse"; query: string; results: DictEntry[] }
  | null;

/** Auth gate: render the login screen until the user has a session. */
export default function App() {
  const { session, login, register, logout } = useAuth();
  if (!session) return <AuthScreen onLogin={login} onRegister={register} />;
  return <MainApp key={session.user_id} userId={session.user_id} email={session.email} onLogout={logout} />;
}

function MainApp({ userId, email, onLogout }: { userId: string; email: string; onLogout: () => void }) {
  const store = useAppStore(userId);
  const [direction, setDirection] = useState<SearchDirection>("forward");
  const [view, setView] = useState<View>(null);
  const [highlightDue, setHighlightDue] = useState(true);
  const [onlyDue, setOnlyDue] = useState(false);
  const [sort, setSort] = useState<CloudSort>("recent");
  const [reviewing, setReviewing] = useState(false);

  const entryFor = (term: string, lang: string): VocabEntry | undefined =>
    store.entries.find((e) => e.term === term && e.term_lang === lang);

  // --- Case 1: forward lookup confirmed ---
  async function onForwardResult(dict: DictEntry | null, term: string) {
    const term_lang = dict?.term_lang ?? DEFAULT_TERM_LANG;
    const native_lang = dict?.native_lang ?? DEFAULT_NATIVE_LANG;
    setView({ kind: "detail", term, term_lang, native_lang, dict });
    if (dict) {
      // A result was shown → this confirms a lookup (SPEC 4.1).
      await store.recordLookup({
        term,
        term_lang,
        native_lang,
        meaning: JSON.stringify(dict.definitions),
        is_custom: false,
      });
    }
    // No result → wait for the user to save a Custom Definition (no count yet).
  }

  async function onSaveCustom(meaning: string) {
    if (view?.kind !== "detail") return;
    await store.recordLookup({
      term: view.term,
      term_lang: view.term_lang,
      native_lang: view.native_lang,
      meaning: JSON.stringify([meaning]),
      is_custom: true,
    });
    // Re-open detail so the saved definition shows immediately.
    setView({ ...view, dict: { term: view.term, definitions: [meaning], term_lang: view.term_lang, native_lang: view.native_lang } });
  }

  // --- Case 2: reverse lookup results + [+] add ---
  function onReverseResults(results: DictEntry[], query: string) {
    setView({ kind: "reverse", query, results });
  }

  async function onAddReverse(dict: DictEntry) {
    await store.recordLookup({
      term: dict.term,
      term_lang: dict.term_lang || DEFAULT_TERM_LANG,
      native_lang: dict.native_lang || DEFAULT_NATIVE_LANG,
      meaning: JSON.stringify(dict.definitions),
      is_custom: false,
      manualAdd: true,
    });
  }

  // Selecting a cloud tag opens a read-only detail (does NOT count as a lookup).
  function onSelectTag(entry: VocabEntry) {
    setView({
      kind: "detail",
      term: entry.term,
      term_lang: entry.term_lang,
      native_lang: entry.native_lang,
      dict: null,
    });
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Gioitu</h1>
        <div className="header-actions">
          <DictionaryImport onImported={() => undefined} />
          <button className="link" onClick={store.runSync}>Đồng bộ</button>
          <span className="user-email" title={email}>{email}</span>
          <button className="link" onClick={onLogout}>Đăng xuất</button>
        </div>
      </header>

      <SearchBar
        direction={direction}
        onDirectionChange={setDirection}
        onForwardResult={onForwardResult}
        onReverseResults={onReverseResults}
      />

      <FilterBar
        dueCount={store.dueEntries.length}
        highlightDue={highlightDue}
        onlyDue={onlyDue}
        sort={sort}
        onToggleHighlight={() => setHighlightDue((v) => !v)}
        onToggleOnlyDue={() => setOnlyDue((v) => !v)}
        onSortChange={setSort}
        onStartReview={() => setReviewing(true)}
      />

      <main className="content">
        <section className="cloud-area">
          {!store.loaded ? (
            <p className="empty">Đang tải…</p>
          ) : (
            <WordCloud
              entries={store.entries}
              highlightDue={highlightDue}
              onlyDue={onlyDue}
              sort={sort}
              onSelect={onSelectTag}
            />
          )}
        </section>

        {view?.kind === "detail" && (
          <DetailPanel
            term={view.term}
            dict={view.dict}
            entry={entryFor(view.term, view.term_lang)}
            onSaveCustom={onSaveCustom}
            onClose={() => setView(null)}
          />
        )}
        {view?.kind === "reverse" && (
          <ReverseResults
            query={view.query}
            results={view.results}
            onAdd={onAddReverse}
            onClose={() => setView(null)}
          />
        )}
      </main>

      {reviewing && (
        <ReviewSession
          queue={store.dueEntries}
          onGrade={store.gradeReview}
          onClose={() => setReviewing(false)}
        />
      )}

      <Toasts toasts={store.toasts} />
    </div>
  );
}
