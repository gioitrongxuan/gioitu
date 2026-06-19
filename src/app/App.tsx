// Composition root: wires auth, the app store and the main screen together.
// Layout is Search Bar → Filter Bar → Word Cloud (SPEC 3), plus the detail
// panel, the review session and dictionary import. Lookup orchestration lives
// in useLookup; per-feature logic lives under src/features/*.

import { useState } from "react";
import { useAppStore } from "@/features/review/state/store";
import { WordCloud } from "@/features/review/ui/WordCloud";
import { FilterBar } from "@/features/review/ui/FilterBar";
import { ReviewSession } from "@/features/review/ui/ReviewSession";
import { reassignEntries } from "@/features/review/data/repository";
import { CloudSort } from "@/features/review/domain/wordcloud";
import { SearchBar } from "@/features/dictionary/ui/SearchBar";
import { DetailPanel } from "@/features/dictionary/ui/DetailPanel";
import { DictionaryImport } from "@/features/dictionary/ui/DictionaryImport";
import { DictionaryManager } from "@/features/dictionary/ui/DictionaryManager";
import { AuthScreen } from "@/features/auth/ui/AuthScreen";
import { useAuth } from "@/features/auth/useAuth";
import { GUEST_USER_ID, getSession } from "@/features/auth/data/auth";
import { Toasts } from "@/shared/ui/Toasts";
import { VocabEntry } from "@/shared/types";
import { DEFAULT_PAIR, LangPair } from "@/shared/languages";
import { useLookup } from "./useLookup";

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
  const [highlightDue, setHighlightDue] = useState(true);
  const [onlyDue, setOnlyDue] = useState(false);
  const [sort, setSort] = useState<CloudSort>("recent");
  const [reviewing, setReviewing] = useState(false);
  const [managing, setManaging] = useState(false);
  const { view, onResult, lookup, onSaveCustom, onSelectTag, closeView } = useLookup(store, pair);

  const entryFor = (term: string, lang: string): VocabEntry | undefined =>
    store.entries.find((e) => e.term === term && e.term_lang === lang);

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
            results={view.results}
            entry={entryFor(view.primaryTerm, view.term_lang)}
            onSaveCustom={onSaveCustom}
            onClose={closeView}
            onLookup={lookup}
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
