// Composition root: wires auth, the app store and the main screen together.
// Layout is Search Bar → Filter Bar → Word Cloud (SPEC 3), plus the detail
// panel, the review session and dictionary import. Lookup orchestration lives
// in useLookup; per-feature logic lives under src/features/*.

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/features/review/state/store";
import { WordCloud } from "@/features/review/ui/WordCloud";
import { FilterBar } from "@/features/review/ui/FilterBar";
import { ReviewSession } from "@/features/review/ui/ReviewSession";
import { LearnedCloud } from "@/features/review/ui/LearnedCloud";
import { CloudViewControls } from "@/features/review/ui/CloudViewControls";
import { reassignEntries } from "@/features/review/data/repository";
import { CloudSort, CloudLang, TimeGrouping } from "@/features/review/domain/wordcloud";
import { SearchBar } from "@/features/dictionary/ui/SearchBar";
import { hasLocalDict } from "@/features/dictionary/data/search";
import { DictSource, loadSource, saveSource } from "@/features/dictionary/domain/source";
import { DetailPanel } from "@/features/dictionary/ui/DetailPanel";
import { DictionaryImport } from "@/features/dictionary/ui/DictionaryImport";
import { DictionaryManager } from "@/features/dictionary/ui/DictionaryManager";
import { CustomDictionary } from "@/features/dictionary/ui/CustomDictionary";
import { syncCustomDicts } from "@/features/dictionary/data/customDictSync";
import { TermResult } from "@/features/dictionary/data/search";
import { sensesToLines, glossaryToLines } from "@/shared/structured-content";
import { proposeWord } from "@/features/contribute/data/contribute";
import { ContributionReview } from "@/features/contribute/ui/ContributionReview";
import { ThemeSettings } from "@/features/theme/ui/ThemeSettings";
import { ThemeBackdrop } from "@/features/theme/ui/ThemeBackdrop";
import { AuthScreen } from "@/features/auth/ui/AuthScreen";
import { YomitanSync } from "@/features/auth/ui/YomitanSync";
import { PremiumModal } from "@/features/premium/ui/PremiumModal";
import { useAuth } from "@/features/auth/useAuth";
import { GUEST_USER_ID, getSession } from "@/features/auth/data/auth";
import { Toasts } from "@/shared/ui/Toasts";
import { MOBILE_MEDIA_QUERY, useMediaQuery } from "@/shared/ui/useMediaQuery";
import { VocabEntry } from "@/shared/types";
import { DEFAULT_PAIR, LangPair } from "@/shared/languages";
import { useLookup } from "./useLookup";
import { HeaderMenu, MenuItem } from "./HeaderMenu";

/**
 * No auth gate: the app is fully usable as a guest. Signing in is optional and
 * only adds cross-device cloud sync. On the first sign-in, any progress made as
 * a guest is migrated to the new account so nothing is lost.
 */
export default function App() {
  const { session, loginWithGoogle, devLogin, logout, refresh } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  // Sau khi đăng nhập (Google hoặc dev), gom dữ liệu học của phiên khách về tài khoản.
  const adoptGuestData = async () => {
    const s = getSession();
    if (s) await reassignEntries(GUEST_USER_ID, s.user_id);
    setShowAuth(false);
  };

  const signInWithGoogle = async (credential: string) => {
    await loginWithGoogle(credential);
    await adoptGuestData();
  };

  const signInDev = async () => {
    await devLogin();
    await adoptGuestData();
  };

  const userId = session?.user_id ?? GUEST_USER_ID;

  return (
    <>
      <MainApp
        key={userId}
        userId={userId}
        email={session?.email ?? null}
        isAdmin={session?.is_admin === true}
        isPremium={session?.is_premium === true}
        onPremiumActivated={refresh}
        onLogout={logout}
        onRequestLogin={() => setShowAuth(true)}
      />
      {showAuth && !session && (
        <AuthScreen onCredential={signInWithGoogle} onDevLogin={signInDev} onClose={() => setShowAuth(false)} />
      )}
    </>
  );
}

interface MainAppProps {
  userId: string;
  email: string | null;
  /** Only an admin may import/edit the shared server dictionary. */
  isAdmin: boolean;
  /** Đã kích hoạt Premium (mở khoá đồng bộ từ điển cá nhân). */
  isPremium: boolean;
  /** Đọc lại phiên sau khi kích hoạt Premium để UI cập nhật ngay. */
  onPremiumActivated: () => void;
  onLogout: () => void;
  onRequestLogin: () => void;
}

function MainApp({ userId, email, isAdmin, isPremium, onPremiumActivated, onLogout, onRequestLogin }: MainAppProps) {
  const store = useAppStore(userId);
  // Tăng mỗi khi sync từ điển kéo dữ liệu về → buộc danh sách từ điển đọc lại
  // (để dict mới hiện ngay, khỏi phải tải lại trang trên máy khác).
  const [syncTick, setSyncTick] = useState(0);

  // Đồng bộ từ điển cá nhân (Premium) ngầm: chạy khi load, khi vừa bật Premium,
  // và sau mỗi lần soạn/xoá. Best-effort, không cản UI, không toast (chỉ làm mới
  // danh sách); SRS đồng bộ riêng trong store.
  const syncDicts = useCallback(() => {
    if (email && isPremium)
      void syncCustomDicts()
        .then((r) => { if (r.ok) setSyncTick((t) => t + 1); })
        .catch((e) => console.error("dict sync failed", e));
  }, [email, isPremium]);
  useEffect(() => {
    syncDicts();
  }, [syncDicts]);

  // Nút "Đồng bộ": chạy cả SRS lẫn từ điển cá nhân, có tiến độ + phản hồi rõ.
  const runFullSync = async () => {
    store.pushToast("Đang đồng bộ…", "info");
    await store.runSync();
    if (email && isPremium) {
      const r = await syncCustomDicts();
      setSyncTick((t) => t + 1);
      store.pushToast(
        r.ok ? `Đã đồng bộ · ${r.count} từ điển cá nhân` : "Đã đồng bộ dữ liệu học · chưa kết nối được từ điển",
        r.ok ? "success" : "warn",
      );
    } else if (email) {
      store.pushToast("Đã đồng bộ dữ liệu học. Cần Premium để đồng bộ từ điển cá nhân.", "info");
    } else {
      store.pushToast("Đã đồng bộ", "success");
    }
  };
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
  // Shared by both maps (home + "Đã thuộc") so the view reads the same way.
  const [cloudLang, setCloudLang] = useState<CloudLang>("all");
  const [grouping, setGrouping] = useState<TimeGrouping>("none");
  const [reviewing, setReviewing] = useState(false);
  const [managing, setManaging] = useState(false);
  // Từ được mở sẵn trong tab sửa của manager (đi từ nút "Sửa từ" trên kết quả tra).
  const [manageEditQuery, setManageEditQuery] = useState<string | null>(null);
  const [theming, setTheming] = useState(false);
  const [customDict, setCustomDict] = useState(false);
  const [connectingYomitan, setConnectingYomitan] = useState(false);
  const [premium, setPremium] = useState(false);
  const [contribReview, setContribReview] = useState(false);
  const [page, setPage] = useState<"home" | "learned">("home");
  const { view, onResult, lookup, onSaveCustom, onSelectTag, addResult, closeView } = useLookup(store, pair, dictSource);

  const entryFor = (term: string, lang: string): VocabEntry | undefined =>
    store.entries.find((e) => e.term === term && e.term_lang === lang);

  // Đề xuất một kết quả tra lên từ điển hệ thống (#70 — 6.1); admin duyệt sau.
  const proposeResult = async (res: TermResult) => {
    const e = res.entry;
    const gloss = e.senses?.length ? sensesToLines(e.senses) : glossaryToLines(e.definitions);
    const pos = [...new Set((e.senses ?? []).flatMap((s) => s.tags))];
    try {
      await proposeWord({ term: e.term, reading: e.reading, term_lang: e.term_lang, native_lang: e.native_lang, gloss, pos });
      store.pushToast("Đã gửi đề xuất, chờ admin duyệt", "success");
    } catch (err) {
      store.pushToast((err as Error).message, "warn");
    }
  };

  // Mobile: panel chi tiết là bottom sheet phủ lên trang — nội dung nền bị
  // backdrop che chuột/chạm, còn inert + aria-hidden chặn nốt focus bàn phím
  // và trình đọc màn hình. Desktop panel nằm cạnh nội dung nên không áp.
  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const behindSheet = isMobile && view?.kind === "detail" ? { inert: "", "aria-hidden": true } : {};

  // Shared between the home and "Đã thuộc" pages so selecting a word opens its
  // detail in place, without jumping back to the home screen.
  const detailPanel = view?.kind === "detail" && (
    <DetailPanel
      term={view.term}
      term_lang={view.term_lang}
      native_lang={view.native_lang}
      results={view.results}
      entry={entryFor(view.primaryTerm, view.term_lang)}
      onSaveCustom={onSaveCustom}
      onClose={closeView}
      onLookup={lookup}
      onAddResult={addResult}
      onMarkKnown={store.markKnownEntry}
      onMarkForgotten={store.markForgottenEntry}
      onDelete={async (e) => {
        await store.deleteEntry(e);
        closeView();
      }}
      isAdmin={isAdmin}
      onAdminEdit={(term) => {
        setManageEditQuery(term);
        setManaging(true);
      }}
      loggedIn={email != null}
      onPropose={proposeResult}
    />
  );

  // Một danh sách action cho cả hai cách hiện: hàng nút (desktop) và menu ☰
  // (mobile). CSS theo breakpoint 760px quyết định bên nào hiển thị.
  const menuItems: MenuItem[] = [
    ...(isAdmin
      ? [
          { label: "Quản lý từ điển", run: () => setManaging(true) },
          { label: "Duyệt đề xuất", run: () => setContribReview(true) },
        ]
      : []),
    ...(store.learnedEntries.length > 0
      ? [{ label: `Đã thuộc (${store.learnedEntries.length})`, run: () => setPage("learned") }]
      : []),
    { label: "Từ điển cá nhân", run: () => setCustomDict(true) },
    { label: "Giao diện", run: () => setTheming(true) },
    { label: "Kết nối Yomitan", run: () => setConnectingYomitan(true) },
    { label: isPremium ? "Premium ✓" : "Premium", run: () => setPremium(true) },
    ...(email
      ? [
          { label: "Đồng bộ", run: runFullSync },
          { label: "Đăng xuất", run: onLogout },
        ]
      : [{ label: "Đăng nhập", run: onRequestLogin }]),
  ];

  return (
    <div className="app">
      <ThemeBackdrop />
      <header className="app-header" {...behindSheet}>
        {/* Header kiểu jisho: chỉ wordmark + nhập từ điển + ☰; mọi action phụ
            nằm trong menu để phần đầu trang nhường đất cho ô tìm kiếm. */}
        <h1 className="wordmark">
          <span className="logo-mark" lang="ja" aria-hidden>語</span>
          Gioitu
        </h1>
        <div className="header-actions">
          <DictionaryImport
            pair={pair}
            onPairChange={setPair}
            source={dictSource}
            onSourceChange={chooseSource}
            onImported={syncDicts}
            loggedIn={email != null}
            onRequestLogin={onRequestLogin}
            reloadToken={syncTick}
          />
          <HeaderMenu items={menuItems} email={email} />
        </div>
      </header>

      {page === "learned" ? (
        <div className="learned-head" {...behindSheet}>
          <button className="link" onClick={() => setPage("home")}>← Quay lại</button>
          <h2>Đã thuộc 🎉 ({store.learnedEntries.length})</h2>
          <CloudViewControls
            lang={cloudLang}
            grouping={grouping}
            onLangChange={setCloudLang}
            onGroupingChange={setGrouping}
          />
        </div>
      ) : (
        <div {...behindSheet}>
          <SearchBar pair={pair} source={dictSource} onResult={onResult} />

          <FilterBar
            dueCount={store.dueEntries.length}
            highlightDue={highlightDue}
            onlyDue={onlyDue}
            deleteMode={deleteMode}
            sort={sort}
            lang={cloudLang}
            grouping={grouping}
            onToggleHighlight={() => setHighlightDue((v) => !v)}
            onToggleOnlyDue={() => setOnlyDue((v) => !v)}
            onToggleDeleteMode={() => setDeleteMode((v) => !v)}
            onSortChange={setSort}
            onLangChange={setCloudLang}
            onGroupingChange={setGrouping}
            onStartReview={() => setReviewing(true)}
          />
        </div>
      )}

      <main className="content">
        <section className="cloud-area" {...behindSheet}>
          {!store.loaded ? (
            <p className="empty">Đang tải…</p>
          ) : page === "learned" ? (
            <LearnedCloud
              entries={store.learnedEntries}
              lang={cloudLang}
              grouping={grouping}
              onSelect={onSelectTag}
            />
          ) : (
            <WordCloud
              entries={store.entries}
              highlightDue={highlightDue}
              onlyDue={onlyDue}
              sort={sort}
              lang={cloudLang}
              grouping={grouping}
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

      {managing && isAdmin && (
        <DictionaryManager
          loggedIn={email != null}
          initialEdit={manageEditQuery != null ? { pair, query: manageEditQuery } : undefined}
          onRequestLogin={() => {
            setManaging(false);
            setManageEditQuery(null);
            onRequestLogin();
          }}
          onClose={() => {
            setManaging(false);
            setManageEditQuery(null);
          }}
        />
      )}

      {customDict && (
        <CustomDictionary
          pair={pair}
          loggedIn={email != null}
          onRequestLogin={() => {
            setCustomDict(false);
            onRequestLogin();
          }}
          onClose={() => setCustomDict(false)}
          onSaved={() => {
            // Nếu đang mở chi tiết một từ, tra lại để từ vừa lưu (nguồn Trên máy) hiện ra.
            if (view?.kind === "detail") lookup(view.term);
            syncDicts(); // đẩy từ điển vừa soạn lên (nếu Premium)
          }}
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

      {contribReview && isAdmin && <ContributionReview onClose={() => setContribReview(false)} />}

      {premium && (
        <PremiumModal
          loggedIn={email != null}
          isAdmin={isAdmin}
          isPremium={isPremium}
          onActivated={onPremiumActivated}
          onRequestLogin={() => {
            setPremium(false);
            onRequestLogin();
          }}
          onClose={() => setPremium(false)}
        />
      )}

      <Toasts toasts={store.toasts} />
    </div>
  );
}
