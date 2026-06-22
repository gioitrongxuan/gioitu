// Composition root: wires auth, the app store and the main screen together.
// Layout is Search Bar → Filter Bar → Word Cloud (SPEC 3), plus the detail
// panel, the review session and dictionary import. Lookup orchestration lives
// in useLookup; per-feature logic lives under src/features/*.

import { useEffect, useState } from "react";
import { useAppStore } from "@/features/review/state/store";
import { WordCloud } from "@/features/review/ui/WordCloud";
import { FilterBar } from "@/features/review/ui/FilterBar";
import { ReviewSession } from "@/features/review/ui/ReviewSession";
import { LearnedCloud } from "@/features/review/ui/LearnedCloud";
import { reassignEntries } from "@/features/review/data/repository";
import { CloudSort } from "@/features/review/domain/wordcloud";
import { SearchBar } from "@/features/dictionary/ui/SearchBar";
import { hasLocalDict } from "@/features/dictionary/data/search";
import { DictSource, loadSource, saveSource } from "@/features/dictionary/domain/source";
import { DetailPanel } from "@/features/dictionary/ui/DetailPanel";
import { DictionaryImport } from "@/features/dictionary/ui/DictionaryImport";
import { DictionaryManager } from "@/features/dictionary/ui/DictionaryManager";
import { ThemeSettings } from "@/features/theme/ui/ThemeSettings";
import { AuthScreen } from "@/features/auth/ui/AuthScreen";
import { YomitanSync } from "@/features/auth/ui/YomitanSync";
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
  const { session, loginWithGoogle, logout } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  const signInWithGoogle = async (credential: string) => {
    await loginWithGoogle(credential);
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
        <AuthScreen onCredential={signInWithGoogle} onClose={() => setShowAuth(false)} />
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
  // Which dictionary database look-ups hit. Persisted only once the user picks;
  // until then we default to the source that actually has data (local if a
  // dictionary is imported, otherwise the server) so neither kind of user hits
  // an empty screen on first load.
  const [dictSource, setDictSource] = useState<DictSource>(() => loadSource() ?? "local");
  useEffect(() => {
    if (loadSource() != null) return;
    hasLocalDict(pair).then((has) => setDictSource(has ? "local" : "server"));
    // Run once on mount; the saved choice (if any) already won above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const chooseSource = (s: DictSource) => {
    setDictSource(s);
    saveSource(s);
  };
  const [highlightDue, setHighlightDue] = useState(true);
  const [onlyDue, setOnlyDue] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [sort, setSort] = useState<CloudSort>("recent");
  const [reviewing, setReviewing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [theming, setTheming] = useState(false);
  const [connectingYomitan, setConnectingYomitan] = useState(false);
  const [page, setPage] = useState<"home" | "learned">("home");
  const { view, onResult, lookup, onSaveCustom, onSelectTag, addResult, addToReview, closeView } = useLookup(store, pair, dictSource);

  const entryFor = (term: string, lang: string): VocabEntry | undefined =>
    store.entries.find((e) => e.term === term && e.term_lang === lang);

  // Shared between the home and "Đã thuộc" pages so selecting a word opens its
  // detail in place, without jumping back to the home screen.
  const detailPanel = view?.kind === "detail" && (
    <DetailPanel
      term={view.term}
      results={view.results}
      entry={entryFor(view.primaryTerm, view.term_lang)}
      onSaveCustom={onSaveCustom}
      onClose={closeView}
      onLookup={lookup}
      onAddResult={addResult}
      onAddToReview={addToReview}
      onMarkKnown={store.markKnownEntry}
      onMarkForgotten={store.markForgottenEntry}
      onDelete={async (e) => {
        await store.deleteEntry(e);
        closeView();
      }}
    />
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>Gioitu</h1>
        <div className="header-actions">
          <DictionaryImport pair={pair} onImported={() => undefined} />
          <button className="link" onClick={() => setManaging(true)}>Quản lý từ điển</button>
          {store.learnedEntries.length > 0 && (
            <button className="link" onClick={() => setPage("learned")}>
              Đã thuộc ({store.learnedEntries.length})
            </button>
          )}
          <button className="link" onClick={() => setTheming(true)}>Giao diện</button>
          <button className="link" onClick={() => setConnectingYomitan(true)}>Kết nối Yomitan</button>
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

      {page === "learned" ? (
        <div className="learned-head">
          <button className="link" onClick={() => setPage("home")}>← Quay lại</button>
          <h2>Đã thuộc 🎉 ({store.learnedEntries.length})</h2>
        </div>
      ) : (
        <>
          <SearchBar
            pair={pair}
            onPairChange={setPair}
            source={dictSource}
            onSourceChange={chooseSource}
            onResult={onResult}
          />

          <FilterBar
            dueCount={store.dueEntries.length}
            highlightDue={highlightDue}
            onlyDue={onlyDue}
            deleteMode={deleteMode}
            sort={sort}
            onToggleHighlight={() => setHighlightDue((v) => !v)}
            onToggleOnlyDue={() => setOnlyDue((v) => !v)}
            onToggleDeleteMode={() => setDeleteMode((v) => !v)}
            onSortChange={setSort}
            onStartReview={() => setReviewing(true)}
          />
        </>
      )}

      <main className="content">
        <section className="cloud-area">
          {!store.loaded ? (
            <p className="empty">Đang tải…</p>
          ) : page === "learned" ? (
            <LearnedCloud entries={store.learnedEntries} onSelect={onSelectTag} />
          ) : (
            <WordCloud
              entries={store.entries}
              highlightDue={highlightDue}
              onlyDue={onlyDue}
              sort={sort}
              deleteMode={deleteMode}
              onSelect={onSelectTag}
              onDelete={store.deleteEntry}
            />
          )}
        </section>

        {detailPanel}
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

      {theming && <ThemeSettings onClose={() => setTheming(false)} />}

      {connectingYomitan && (
        <YomitanSync
          loggedIn={email != null}
          onRequestLogin={() => {
            setConnectingYomitan(false);
            onRequestLogin();
          }}
          onClose={() => setConnectingYomitan(false)}
        />
      )}

      <Toasts toasts={store.toasts} />
    </div>
  );
}
