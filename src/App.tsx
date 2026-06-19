// Top-level app: Search Bar → Word Cloud → Filter Bar (SPEC 3), plus the
// the detail panel, the review session, and dictionary import.

import { useState } from "react";
import { useAppStore } from "./ui/store";
import { SearchBar } from "./ui/SearchBar";
import { WordCloud } from "./ui/WordCloud";
import { FilterBar } from "./ui/FilterBar";
import { DetailPanel } from "./ui/DetailPanel";
import { ReviewSession } from "./ui/ReviewSession";
import { DictionaryImport } from "./ui/DictionaryImport";
import { DictionaryManager } from "./ui/DictionaryManager";
import { Toasts } from "./ui/Toasts";
import { AuthScreen } from "./ui/AuthScreen";
import { useAuth } from "./ui/useAuth";
import { DictEntry } from "./data/db";
import { VocabEntry } from "./domain/types";
import { CloudSort } from "./domain/wordcloud";
import { DEFAULT_PAIR, LangPair } from "./domain/languages";
import { GUEST_USER_ID, getSession } from "./data/auth";
import { reassignEntries } from "./data/repository";

type View =
  | { kind: "detail"; term: string; term_lang: string; native_lang: string; dict: DictEntry | null }
  | null;

/**
 * No auth gate: the app is fully usable as a guest. Signing in is optional and
 * only adds cross-device cloud sync. On the first sign-in, any progress made as
 * a guest is migrated to the new account so nothing is lost.
 */
export default function App() {
  const { session, login, register, logout } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  const migrateThen =
    (fn: (email: string, password: string) => Promise<void>) =>
    async (email: string, password: string) => {
      await fn(email, password);
      const s = getSession();
      if (s) await reassignEntries(GUEST_USER_ID, s.user_id);
      setShowAuth(false);
    };

  const userId = session?.user_id ?? GUEST_USER_ID;

  return (
    <>
      <MainApp
        key={userId}
        userId={userId}
        email={session?.email ?? null}
        onLogout={logout}
        onRequestLogin={() => setShowAuth(true)}
      />
      {showAuth && !session && (
        <AuthScreen
          onLogin={migrateThen(login)}
          onRegister={migrateThen(register)}
          onClose={() => setShowAuth(false)}
        />
      )}
    </>
  );
}

interface MainAppProps {
  userId: string;
  email: string | null;
  onLogout: () => void;
  onRequestLogin: () => void;
}

function MainApp({ userId, email, onLogout, onRequestLogin }: MainAppProps) {
  const store = useAppStore(userId);
  const [pair, setPair] = useState<LangPair>(DEFAULT_PAIR);
  const [view, setView] = useState<View>(null);
  const [highlightDue, setHighlightDue] = useState(true);
  const [onlyDue, setOnlyDue] = useState(false);
  const [sort, setSort] = useState<CloudSort>("recent");
  const [reviewing, setReviewing] = useState(false);
  const [managing, setManaging] = useState(false);

  const entryFor = (term: string, lang: string): VocabEntry | undefined =>
    store.entries.find((e) => e.term === term && e.term_lang === lang);

  // --- Forward lookup confirmed (SPEC 4.1) ---
  async function onResult(dict: DictEntry | null, term: string, p: LangPair) {
    const term_lang = dict?.term_lang ?? p.source;
    const native_lang = dict?.native_lang ?? p.target;
    setView({ kind: "detail", term, term_lang, native_lang, dict });
    if (dict) {
      // A result was shown → this confirms a lookup.
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
          <DictionaryImport pair={pair} onImported={() => undefined} />
          <button className="link" onClick={() => setManaging(true)}>Quản lý từ điển</button>
          {email ? (
            <>
              <button className="link" onClick={store.runSync}>Đồng bộ</button>
              <span className="user-email" title={email}>{email}</span>
              <button className="link" onClick={onLogout}>Đăng xuất</button>
            </>
          ) : (
            <>
              <span className="user-email">Khách</span>
              <button className="link" onClick={onRequestLogin}>Đăng nhập</button>
            </>
          )}
        </div>
      </header>

      <SearchBar pair={pair} onPairChange={setPair} onResult={onResult} />

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
      </main>

      {reviewing && (
        <ReviewSession
          queue={store.dueEntries}
          onGrade={store.gradeReview}
          onClose={() => setReviewing(false)}
        />
      )}

      {managing && (
        <DictionaryManager
          loggedIn={email != null}
          onRequestLogin={() => {
            setManaging(false);
            onRequestLogin();
          }}
          onClose={() => setManaging(false)}
        />
      )}

      <Toasts toasts={store.toasts} />
    </div>
  );
}
