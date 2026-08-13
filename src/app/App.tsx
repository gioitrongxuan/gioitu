// Composition root: wires auth, the app store and the main screen together.
// Layout is Search Bar → Filter Bar → Word Cloud (SPEC 3), plus the detail
// panel, the review session and dictionary import. Lookup orchestration lives
// in useLookup; per-feature logic lives under src/features/*.

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/features/review/state/store";
import { WordCloud } from "@/features/review/ui/WordCloud";
import { FilterBar } from "@/features/review/ui/FilterBar";
import { ReviewSession } from "@/features/review/ui/ReviewSession";
import { ListenSession } from "@/features/review/ui/ListenSession";
import { LearnedCloud } from "@/features/review/ui/LearnedCloud";
import { CloudViewControls } from "@/features/review/ui/CloudViewControls";
import { GuestBackupBanner } from "@/features/review/ui/GuestBackupBanner";
import { getAllEntries, reassignEntries } from "@/features/review/data/repository";
import {
  AddedWindow,
  CloudSort,
  CloudLang,
  CloudGrouping,
  filterByAddedWithin,
  filterByLang,
} from "@/features/review/domain/wordcloud";
import { loadCloudLang, saveCloudLang } from "@/features/review/domain/cloudLangSettings";
import { loadAddedWindow, saveAddedWindow } from "@/features/review/domain/addedWindowSettings";
import { listenableEntries } from "@/features/review/domain/listen";
import { formatLastSync } from "@/features/review/domain/syncStatus";
import { formatDueTitle } from "@/features/review/domain/dueBadge";
import { SearchBar } from "@/features/dictionary/ui/SearchBar";
import { hasLocalDict } from "@/features/dictionary/data/search";
import { DictSource, loadSource, saveSource } from "@/features/dictionary/domain/source";
import { DetailPanel } from "@/features/dictionary/ui/DetailPanel";
import { DictionaryImport } from "@/features/dictionary/ui/DictionaryImport";
import { syncCustomDicts } from "@/features/dictionary/data/customDictSync";
import { TermResult } from "@/features/dictionary/data/search";
import { ADD_PARAM_KEYS, parseAddParams } from "@/features/dictionary/domain/quickadd";
import { isDraftFilled } from "@/features/dictionary/domain/customEntry";
import { saveQuickAdd } from "@/features/dictionary/data/inbox";
import { aiFillDraft } from "@/features/dictionary/data/aiGenerate";
import { sensesToLines, glossaryToLines } from "@/shared/structured-content";
import { proposeWord } from "@/features/contribute/data/contribute";
import { ContributionReview } from "@/features/contribute/ui/ContributionReview";
import { ThemeBackdrop } from "@/features/theme/ui/ThemeBackdrop";
import { AuthScreen } from "@/features/auth/ui/AuthScreen";
import { YomitanSync } from "@/features/auth/ui/YomitanSync";
import { PremiumModal } from "@/features/premium/ui/PremiumModal";
import { useAuth } from "@/features/auth/useAuth";
import { GUEST_USER_ID, Session } from "@/features/auth/data/auth";
import { loadReviewStreak } from "@/features/review/data/streak";
import { loadTodayStats } from "@/features/review/data/todayStats";
import { mostForgotten } from "@/features/review/domain/reviewStats";
import { guestAdoptionPrompt } from "@/features/auth/domain/guestAdoption";
import { ToastHost } from "@/shared/ui/Toasts";
import { Skeleton } from "@/shared/ui/Skeleton";
import { MOBILE_MEDIA_QUERY, useMediaQuery } from "@/shared/ui/useMediaQuery";
import { VocabEntry } from "@/shared/types";
import { LangPair, loadPair, savePair } from "@/shared/languages";
import { useLookup } from "./useLookup";
import { useAppRoute, useBackEntry, useWordUrl } from "./useHistoryRouting";
import { khuOf, KHU_HOME } from "./routes";
import { loadOnboarded, markOnboarded, decideOnboarding } from "./firstRun";
import { Onboarding } from "./Onboarding";
import { AppNav } from "./AppNav";
import { TodayScreen } from "./TodayScreen";
import { MeScreen, MeSection } from "./MeScreen";

// React.lazy cho các màn phụ (không cần ngay lúc mở app) — giữ chunk chính nhẹ.
// Mỗi module export theo tên (không có default) nên bọc lại thành { default }.
const KanjiStats = lazy(() => import("@/features/kanjistats/ui").then((m) => ({ default: m.KanjiStats })));
const VocabStudy = lazy(() => import("@/features/vocabstudy/ui").then((m) => ({ default: m.VocabStudy })));
const DictionaryManager = lazy(() =>
  import("@/features/dictionary/ui/DictionaryManager").then((m) => ({ default: m.DictionaryManager })),
);
const CustomDictionary = lazy(() =>
  import("@/features/dictionary/ui/CustomDictionary").then((m) => ({ default: m.CustomDictionary })),
);
const ThemeSettings = lazy(() =>
  import("@/features/theme/ui/ThemeSettings").then((m) => ({ default: m.ThemeSettings })),
);
const QuickAdd = lazy(() =>
  import("@/features/dictionary/ui/QuickAdd").then((m) => ({ default: m.QuickAdd })),
);
const ReviewStats = lazy(() =>
  import("@/features/review/ui/ReviewStats/ReviewStats").then((m) => ({ default: m.ReviewStats })),
);

// Tiêu đề gốc của tab, chụp một lần lúc nạp module (trước khi ta chèn "(N)");
// strip phòng khi HMR nạp lại sau khi tiêu đề đã bị chèn số đến hạn.
const BASE_TITLE = document.title.replace(/^\(\d+\)\s/, "");

/**
 * No auth gate: the app is fully usable as a guest. Signing in is optional and
 * only adds cross-device cloud sync. On the first sign-in, any progress made as
 * a guest is migrated to the new account so nothing is lost.
 */
export default function App() {
  const { session, loginWithGoogle, devLogin, logout, refresh } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  // Lý do mở màn đăng nhập (vd token hết hạn) — hiện như banner trên AuthScreen.
  // Nằm ở App gốc nên không mất khi cây MainApp remount lúc đăng xuất.
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const openLogin = (notice: string | null = null) => {
    setAuthNotice(notice);
    setShowAuth(true);
  };
  const closeAuth = () => {
    setShowAuth(false);
    setAuthNotice(null);
  };

  // Token hết hạn giữa chừng (401): đăng xuất (bỏ token đã vô hiệu) rồi mời đăng
  // nhập lại kèm lý do. Gọi được từ cả đồng bộ ngầm lẫn nút "Đồng bộ" (qua store).
  const handleSessionExpired = () => {
    logout();
    openLogin("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.");
  };

  // Gom dữ liệu học của phiên khách về tài khoản vừa đăng nhập. Chạy qua callback
  // của useAuth để hoàn tất TRƯỚC khi session (và userId) đổi — tránh đua với lần
  // đồng bộ tài khoản mới khi cây app remount (xem useAuth).
  // Máy dùng chung: nếu trên máy đang có tiến trình khách thì HỎI trước khi gộp —
  // đừng lặng lẽ nuốt dữ liệu người khác vào tài khoản vừa đăng nhập. Không có gì
  // để gộp (prompt null) thì reassignEntries vẫn là no-op nên bỏ qua luôn.
  const migrateGuestData = async (s: Session) => {
    const prompt = guestAdoptionPrompt((await getAllEntries(GUEST_USER_ID)).length);
    if (prompt && !window.confirm(prompt)) return;
    await reassignEntries(GUEST_USER_ID, s.user_id);
  };

  const signInWithGoogle = async (credential: string) => {
    await loginWithGoogle(credential, migrateGuestData);
    closeAuth();
  };

  const signInDev = async () => {
    await devLogin(undefined, migrateGuestData);
    closeAuth();
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
        onRequestLogin={() => openLogin()}
        onSessionExpired={handleSessionExpired}
      />
      {showAuth && !session && (
        <AuthScreen notice={authNotice} onCredential={signInWithGoogle} onDevLogin={signInDev} onClose={closeAuth} />
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
  /** Token hết hạn (401) khi đồng bộ: đăng xuất + mời đăng nhập lại. */
  onSessionExpired: () => void;
}

function MainApp({ userId, email, isAdmin, isPremium, onPremiumActivated, onLogout, onRequestLogin, onSessionExpired }: MainAppProps) {
  // isPremium vào store chỉ để bản "Xuất dữ liệu học" kèm lịch sử ôn (#165).
  const store = useAppStore(userId, onSessionExpired, isPremium);
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

  // Nút "Đồng bộ": chạy cả SRS lẫn từ điển cá nhân, phản hồi TRUNG THỰC theo kết
  // cục thật (không còn báo "Đã đồng bộ" vô điều kiện). Token hết hạn thì store
  // đã toast + mời đăng nhập lại; offline thì dừng ở dữ liệu học, không giả vờ
  // đồng bộ tiếp từ điển.
  const runFullSync = async () => {
    store.pushToast("Đang đồng bộ…", "info");
    const status = await store.runSync();
    if (status === "unauthorized") return; // store đã xử lý (toast + mời đăng nhập lại)
    if (status === "offline") {
      store.pushToast("Chưa kết nối được máy chủ · dữ liệu đã lưu trên máy", "warn");
      return;
    }
    if (email && isPremium) {
      const r = await syncCustomDicts();
      setSyncTick((t) => t + 1);
      if (!r.ok) {
        store.pushToast("Đã đồng bộ dữ liệu học · chưa kết nối được từ điển", "warn");
      } else if (!r.pushed) {
        store.pushToast(`Đã nhận ${r.count} từ điển · chưa đẩy lên được (có thể vượt hạn mức)`, "warn");
      } else {
        store.pushToast(`Đã đồng bộ · ${r.count} từ điển`, "success");
      }
    } else if (email) {
      store.pushToast("Đã đồng bộ dữ liệu học. Cần Premium để đồng bộ từ điển.", "info");
    } else {
      store.pushToast("Đã đồng bộ", "success");
    }
  };
  // Cặp ngôn ngữ được lưu lại (localStorage) như nguồn từ điển: mở lại app giữ
  // đúng cặp đang tra thay vì nhảy về mặc định.
  const [pair, setPair] = useState<LangPair>(loadPair);
  const choosePair = (p: LangPair) => {
    setPair(p);
    savePair(p);
  };
  // Which dictionary database look-ups hit. Persisted only once the user picks;
  // until then we default to the source that actually has data (local if a
  // dictionary is imported, otherwise the server) so neither kind of user hits
  // an empty screen on first load.
  const [dictSource, setDictSource] = useState<DictSource>(() => loadSource() ?? "local");
  useEffect(() => {
    if (loadSource() != null) return;
    hasLocalDict(pair).then((has) => setDictSource(has ? "local" : "server"));
    // Run once on mount; the saved choice (if any) already won above.
  }, []);
  const chooseSource = (s: DictSource) => {
    setDictSource(s);
    saveSource(s);
  };
  // Onboarding lần đầu (#152): chỉ chào người mới thật sự — ai đã có dữ liệu
  // học hoặc từ điển trên máy (dùng app từ trước khi có onboarding) được đánh
  // dấu "đã xem" trong im lặng. Đọc IndexedDB trực tiếp thay vì store.entries
  // để không đua với lượt load async đầu tiên của store.
  const [onboarding, setOnboarding] = useState(false);
  const closeOnboarding = () => {
    markOnboarded();
    setOnboarding(false);
  };
  useEffect(() => {
    if (loadOnboarded()) return;
    let cancelled = false;
    Promise.all([getAllEntries(userId), hasLocalDict(pair)]).then(([entries, hasDict]) => {
      if (cancelled) return;
      const decision = decideOnboarding(false, entries.length > 0, hasDict);
      if (decision === "adopt") markOnboarded();
      if (decision === "show") setOnboarding(true);
    });
    return () => {
      cancelled = true;
    };
    // Chạy một lần lúc mở app (MainApp remount theo userId nên mỗi phiên một lần).
  }, []);
  const [highlightDue, setHighlightDue] = useState(true);
  const [onlyDue, setOnlyDue] = useState(false);
  const [sort, setSort] = useState<CloudSort>("recent");
  // Shared by both maps (home + "Đã thuộc") và bộ lọc phiên ôn (App.tsx dueEntriesForReview)
  // nên đọc/ghi cùng một chỗ. Persist qua localStorage để mở lại app không nhảy về "Cả hai".
  const [cloudLang, setCloudLang] = useState<CloudLang>(loadCloudLang);
  const changeCloudLang = useCallback((lang: CloudLang) => {
    setCloudLang(lang);
    saveCloudLang(lang);
  }, []);
  const [grouping, setGrouping] = useState<CloudGrouping>("none");
  // Khoanh vùng "đợt học gần đây" (#250): thu hẹp bản đồ VÀ hàng đợi ôn về những
  // từ mới thêm. Persist cùng lý do với cloudLang — đợt học kéo dài nhiều phiên.
  const [addedWindow, setAddedWindow] = useState<AddedWindow>(loadAddedWindow);
  const changeAddedWindow = useCallback((added: AddedWindow) => {
    setAddedWindow(added);
    saveAddedWindow(added);
  }, []);
  // null = không ôn; mảng = hàng đợi phiên ôn (toàn bộ due, hoặc chỉ một tầng
  // trí nhớ khi bấm "Ôn N từ này" trên Word Cloud — BACKLOG #159).
  const [reviewQueue, setReviewQueue] = useState<VocabEntry[] | null>(null);
  // Chế độ nghe (không SRS, không ghi gì) — chỉ là bật/tắt lớp phủ phát tiếng.
  const [listening, setListening] = useState(false);
  const [managing, setManaging] = useState(false);
  // Từ được mở sẵn trong tab sửa của manager (đi từ nút "Sửa từ" trên kết quả tra).
  const [manageEditQuery, setManageEditQuery] = useState<string | null>(null);
  const [theming, setTheming] = useState(false);
  const [customDict, setCustomDict] = useState(false);
  const [connectingYomitan, setConnectingYomitan] = useState(false);
  const [premium, setPremium] = useState(false);
  const [contribReview, setContribReview] = useState(false);
  const [reviewStats, setReviewStats] = useState(false);
  // Thêm nhanh một từ (null = đóng). `term` là mặt chữ điền sẵn khi mở từ
  // bookmarklet / Share Target; rỗng khi mở từ menu. `solo` = cửa sổ popup
  // riêng (?add_solo=1): chỉ vẽ form, không dựng vỏ app xung quanh.
  const [quickAdd, setQuickAdd] = useState<{ term: string; solo?: boolean } | null>(null);
  // Cửa sổ proxy AI tí hon của overlay ngoài trang (?add_ai=1) — xem effect ?add=.
  const [aiProxy, setAiProxy] = useState(false);
  const { view, onResult, lookup, lookupKanji, onSaveCustom, onSelectTag, openWord, addResult, closeView, lookupDetails } = useLookup(store, pair, dictSource);
  // Chuỗi ngày + dải hoạt động màn Hôm nay (#150). Buộc identity vào "đang ôn
  // hay không" để TodayScreen (vẫn mount sau lớp phủ phiên ôn) đọc lại nhật ký
  // khi phiên đóng — chuỗi ngày nối ngay, không đợi tải lại trang.
  const reviewing = reviewQueue != null;
  const loadStats = useCallback(() => loadTodayStats(userId), [userId, reviewing]);
  // Routing History API (#148): mỗi trang một URL (F5 giữ chỗ, Back/Forward đi
  // giữa các trang), deep-link /word/:pair/:term mở panel chi tiết lúc tải trang.
  const { page, gotoPage } = useAppRoute((w) =>
    openWord({ term: w.term, term_lang: w.term_lang, native_lang: w.native_lang }),
  );

  // Back đóng overlay thay vì thoát app: mỗi overlay đang mở chiếm một entry
  // History; panel chi tiết còn phản chiếu từ đang xem lên URL để chia sẻ được.
  useBackEntry(view != null, closeView);
  useWordUrl(
    view?.kind === "detail"
      ? { kind: "word", term_lang: view.term_lang, native_lang: view.native_lang, term: view.term }
      : null,
  );
  useBackEntry(reviewQueue != null, () => setReviewQueue(null));
  useBackEntry(listening, () => setListening(false));
  useBackEntry(managing, () => {
    setManaging(false);
    setManageEditQuery(null);
  });
  useBackEntry(customDict, () => setCustomDict(false));
  useBackEntry(theming, () => setTheming(false));
  useBackEntry(connectingYomitan, () => setConnectingYomitan(false));
  useBackEntry(premium, () => setPremium(false));
  useBackEntry(contribReview, () => setContribReview(false));
  useBackEntry(quickAdd != null, () => setQuickAdd(null));
  useBackEntry(onboarding, closeOnboarding);

  // Số từ đến hạn hiện lên tiêu đề tab + huy hiệu ứng dụng (PWA app badge) để
  // nhắc ôn kể cả khi app ở tab nền hoặc đã cài. dueEntries đã tự tick mỗi phút
  // và khi tab trở lại foreground (store). setAppBadge chỉ có ở trình duyệt hỗ
  // trợ — dùng optional chaining, bỏ qua an toàn nếu vắng mặt.
  const dueCount = store.dueEntries.length;
  // Hàng đợi ôn thực tế: due lọc theo cloudLang, dùng cho cả 2 điểm vào ôn tập
  // (Hôm nay + Kho từ) và số hiển thị kèm — dueCount (tổng) ở trên giữ nguyên
  // cho tiêu đề tab/app badge/huy hiệu nav, không phụ thuộc bộ lọc UI.
  const dueEntriesForReview = useMemo(
    // Mốc "bây giờ" đọc lúc tính: store.dueEntries tự tick mỗi phút nên memo này
    // được làm mới thường xuyên hơn nhiều so với độ trôi (ngày) của cửa sổ.
    () => filterByAddedWithin(filterByLang(store.dueEntries, cloudLang), addedWindow, Date.now()),
    [store.dueEntries, cloudLang, addedWindow],
  );
  // Chế độ nghe chạy trên toàn bộ từ đang học, không theo hạn ôn — chỉ đếm ở
  // đây, danh sách phát do ListenSession tự dựng (và xáo lại mỗi vòng).
  const listenCount = useMemo(
    () => listenableEntries(store.entries, cloudLang).length,
    [store.entries, cloudLang],
  );
  useEffect(() => {
    document.title = formatDueTitle(dueCount, BASE_TITLE);
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (dueCount > 0) nav.setAppBadge?.(dueCount).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [dueCount]);

  // Bookmarklet (máy tính) và Share Target (điện thoại) mở app kèm ?add=<mặt chữ>
  // → mở form Thêm nhanh điền sẵn. Overlay ngoài trang (extension/bookmarklet)
  // dùng thêm hai chế độ ngầm: add_save=1 (đã duyệt ngay trên trang → lưu rồi tự
  // đóng cửa sổ; đóng không được thì toast của recordLookup vẫn báo) và add_ai=1
  // (gọi AI first-party hộ overlay — token nằm trong localStorage origin app —
  // rồi postMessage kết quả về trang qua window.opener và tự đóng). Đọc một lần
  // lúc mount, xoá param khỏi URL để refresh không lặp lại và mặt chữ không đọng
  // trên thanh địa chỉ.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const req = parseAddParams(params);
    if (!req) return;
    for (const key of ADD_PARAM_KEYS) params.delete(key);
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    const opener = window.opener as Window | null;
    if (req.aiFill && opener) {
      setAiProxy(true);
      // Thiếu add_origin thì thà không gửi ("/") còn hơn phát "*" cho mọi trang.
      const targetOrigin = req.openerOrigin ?? "/";
      aiFillDraft(req.draft.term, req.pair)
        .then((filled) => opener.postMessage({ kind: "gioitu-ai-fill", term: req.draft.term, filled }, targetOrigin))
        .catch((err: unknown) =>
          opener.postMessage(
            { kind: "gioitu-ai-fill", term: req.draft.term, error: (err as Error).message },
            targetOrigin,
          ),
        )
        .then(() => window.close());
    } else if (req.autosave && isDraftFilled(req.draft)) {
      saveQuickAdd(req.pair, req.draft, store.recordLookup)
        .then(() => window.close())
        .catch(() => setQuickAdd({ term: req.draft.term, solo: req.solo }));
    } else {
      setQuickAdd({ term: req.draft.term, solo: req.solo });
    }
  }, []);

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
      error={view.error}
      pending={view.pending}
      entry={entryFor(view.primaryTerm, view.term_lang)}
      onSaveCustom={onSaveCustom}
      onClose={closeView}
      onLookup={lookup}
      onAddResult={addResult}
      onMarkKnown={store.markKnownEntry}
      onMarkKnownNew={store.markKnownByTerm}
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
      currentUserId={userId}
      onRequireLogin={onRequestLogin}
    />
  );

  // Menu ☰ cũ (9-11 mục phẳng) tách về hai chỗ theo khái niệm (#149): các trang
  // trong "Kho từ" thành tab con; phần còn lại thành các mục màn "Tôi".
  const meSections: MeSection[] = [
    {
      title: "Tài khoản",
      items: email
        ? [
            {
              // Nhãn kèm "lần cuối hh:mm" khi đã đồng bộ thành công ít nhất một lần.
              label: store.lastSyncedAt != null ? `Đồng bộ · ${formatLastSync(store.lastSyncedAt)}` : "Đồng bộ",
              run: runFullSync,
            },
            { label: "Đăng xuất", run: onLogout },
          ]
        : [{ label: "Đăng nhập", run: onRequestLogin }],
    },
    {
      title: "Cài đặt",
      items: [
        { label: "Giao diện", run: () => setTheming(true) },
        // Hai mục này chỉ dùng được khi đăng nhập (Yomitan cần định danh cloud,
        // Premium kích hoạt theo tài khoản). Gắn ổ khoá cho khách để "tường đăng
        // nhập" nhất quán — không giấu hẳn cũng không mời-rồi-chặn bất ngờ.
        { label: "Kết nối Yomitan", run: () => setConnectingYomitan(true), locked: !email },
        { label: "Premium", done: isPremium, run: () => setPremium(true), locked: !email },
      ],
    },
    {
      title: "Dữ liệu học",
      items: [
        { label: "Xuất dữ liệu học", run: store.exportBackup },
        { label: "Nhập dữ liệu học", run: store.importBackup },
      ],
    },
    {
      title: "Quản trị",
      items: isAdmin
        ? [
            { label: "Quản lý từ điển", run: () => setManaging(true) },
            { label: "Duyệt đề xuất", run: () => setContribReview(true) },
          ]
        : [],
    },
  ];

  // Tab con của khu "Kho từ" + hành động phụ về từ (dùng chung cho 4 trang con).
  const wordsTabs = (
    <div className="words-tabs">
      {(
        [
          { page: "cloud", label: "Bản đồ từ" },
          // Luôn hiện số (kể cả 0) để "tài sản đã thuộc" thường trực, không chỉ khi có nợ.
          { page: "learned", label: `Đã thuộc (${store.learnedEntries.length})` },
          { page: "kanji", label: "Kanji" },
          { page: "vocabstudy", label: "Học từ vựng" },
        ] as const
      ).map((tab) => (
        <button
          key={tab.page}
          type="button"
          className={`words-tab${page === tab.page ? " active" : ""}`}
          aria-current={page === tab.page ? "page" : undefined}
          onClick={() => gotoPage(tab.page)}
        >
          {tab.label}
        </button>
      ))}
      <div className="words-actions">
        <button className="link" onClick={() => setQuickAdd({ term: "" })}>Thêm nhanh</button>
        <button className="link" onClick={() => setCustomDict(true)}>Từ điển cá nhân</button>
        <button className="link" onClick={() => setReviewStats(true)}>Thống kê ôn tập</button>
      </div>
    </div>
  );

  const khu = khuOf(page);

  // Cửa sổ proxy AI của overlay ngoài trang: chỉ một dòng trạng thái trong lúc
  // gọi model — không dựng vỏ app; xong việc effect ?add= tự đóng cửa sổ.
  if (aiProxy) {
    return (
      <div className="qa-proxy" aria-busy="true">
        ✨ Đang nhờ AI điền…
      </div>
    );
  }

  // Cửa sổ popup riêng cho form (?add_solo=1): chỉ form + toast, không vỏ app.
  if (quickAdd?.solo) {
    return (
      <>
        <Suspense fallback={null}>
          <QuickAdd
            pair={pair}
            initialTerm={quickAdd.term}
            solo
            loggedIn={email != null}
            onRequestLogin={() => {
              // Rơi về app đầy đủ (ngay trong cửa sổ này) để đăng nhập.
              setQuickAdd(null);
              onRequestLogin();
            }}
            onRecordSrs={store.recordLookup}
            onClose={() => {
              window.close();
              // Cửa sổ không cho script đóng (mở tay) → rơi về app đầy đủ.
              setQuickAdd(null);
            }}
            onSaved={syncDicts}
          />
        </Suspense>
        <ToastHost />
      </>
    );
  }

  return (
    <div className="app">
      <ThemeBackdrop />
      {/* Điều hướng 4 khu: tab bar (mobile) / sidebar (desktop). Khi sheet chi
          tiết mở trên mobile, backdrop của sheet đã phủ bar; inert chặn nốt
          focus bàn phím như phần nội dung nền. */}
      <AppNav active={khu} dueCount={dueCount} onSelect={(k) => gotoPage(KHU_HOME[k])} behindSheet={behindSheet} />

      <div className="app-main">
        <header className="app-header" {...behindSheet}>
          {/* Header = thanh tra cứu toàn cục (trang nào cũng tra được ngay —
              vòng lặp gốc: tra → "+" → thấy từ trên bản đồ) + nhập từ điển.
              Điều hướng nằm ở AppNav, action phụ ở màn "Tôi" và hàng tab con
              của Kho từ. Wordmark chỉ hiện trên mobile: desktop brand đã nằm
              ở đỉnh sidebar (AppNav), lặp lại ở đây vừa thừa vừa tốn một hàng. */}
          <h1 className="wordmark">
            <span className="logo-mark" lang="ja" aria-hidden>語</span>
            Gioitu
          </h1>
          <SearchBar pair={pair} source={dictSource} onResult={onResult} />
          <div className="header-actions">
            <DictionaryImport
              pair={pair}
              onPairChange={choosePair}
              source={dictSource}
              onSourceChange={chooseSource}
              onImported={syncDicts}
              loggedIn={email != null}
              onRequestLogin={onRequestLogin}
              reloadToken={syncTick}
            />
          </div>
        </header>

        {(page === "today" || page === "cloud") && (
          <div {...behindSheet}>
            <GuestBackupBanner
              isGuest={userId === GUEST_USER_ID}
              wordCount={store.entries.length}
              onLogin={onRequestLogin}
              onExport={store.exportBackup}
            />
          </div>
        )}

        {khu === "words" && (
          <div {...behindSheet}>
            {wordsTabs}
            {page === "cloud" && (
              <FilterBar
                entries={store.entries}
                dueCount={dueEntriesForReview.length}
                highlightDue={highlightDue}
                onlyDue={onlyDue}
                sort={sort}
                lang={cloudLang}
                grouping={grouping}
                addedWindow={addedWindow}
                onToggleHighlight={() => setHighlightDue((v) => !v)}
                onToggleOnlyDue={() => setOnlyDue((v) => !v)}
                onSortChange={setSort}
                onLangChange={changeCloudLang}
                onGroupingChange={setGrouping}
                onAddedWindowChange={changeAddedWindow}
                onStartReview={() => setReviewQueue(dueEntriesForReview)}
                listenCount={listenCount}
                onStartListen={() => setListening(true)}
              />
            )}
            {page === "learned" && (
              <div className="learned-head">
                <h2>Đã thuộc 🎉 ({store.learnedEntries.length})</h2>
                <CloudViewControls
                  lang={cloudLang}
                  grouping={grouping === "srs" ? "none" : grouping}
                  onLangChange={changeCloudLang}
                  onGroupingChange={setGrouping}
                />
              </div>
            )}
          </div>
        )}

        <main className="content">
          {page === "today" ? (
            <section {...behindSheet}>
              {!store.loaded ? (
                <Skeleton lines={3} className="empty" />
              ) : (
                <TodayScreen
                  dueCount={dueEntriesForReview.length}
                  totalDueCount={dueCount}
                  lang={cloudLang}
                  onLangChange={changeCloudLang}
                  addedWindow={addedWindow}
                  learnedCount={store.learnedEntries.length}
                  forgotten={mostForgotten(store.entries)}
                  loadStats={loadStats}
                  onStartReview={() => setReviewQueue(dueEntriesForReview)}
                  onGoSearch={() => gotoPage("search")}
                  onGoLearned={() => gotoPage("learned")}
                  onSelectWord={(w) => openWord(w)}
                />
              )}
            </section>
          ) : page === "me" ? (
            <section {...behindSheet}>
              <MeScreen email={email} sections={meSections} />
            </section>
          ) : page === "search" ? (
            // Khi panel chi tiết mở, không render cột trống bên cạnh — panel
            // chiếm nguyên bề rộng trang tra cứu.
            view?.kind !== "detail" && (
              <section {...behindSheet}>
                <p className="empty">Tra một từ ở ô bên trên — kết quả hiện ở đây.</p>
              </section>
            )
          ) : (
            <section className="cloud-area" {...behindSheet}>
              {!store.loaded ? (
                <Skeleton lines={3} className="empty" />
              ) : page === "learned" ? (
                <LearnedCloud
                  entries={store.learnedEntries}
                  lang={cloudLang}
                  grouping={grouping === "srs" ? "none" : grouping}
                  onSelect={onSelectTag}
                />
              ) : page === "kanji" ? (
                <Suspense fallback={<Skeleton lines={3} className="empty" />}>
                  <KanjiStats
                    entries={store.entries}
                    onSelectKanji={lookupKanji}
                    onMarkKnown={(kanji) => store.markKnownByTerm(kanji, "ja", "vi")}
                  />
                </Suspense>
              ) : page === "vocabstudy" ? (
                <Suspense fallback={<Skeleton lines={3} className="empty" />}>
                  <VocabStudy
                    entries={store.entries}
                    pair={pair}
                    onPairChange={choosePair}
                    onSelect={(w) => openWord(w)}
                    onToggle={(w, entry) => {
                      // Đánh dấu nhanh: đã thuộc → "không nhớ" (relapse về hàng ôn); ngược
                      // lại → "nhớ" (graduate thẳng sang LEARNED, tạo entry nếu chưa có).
                      // Bật undo để lỡ tay bấm còn hoàn tác được (toast "Hoàn tác").
                      if (entry?.status === "LEARNED") store.markForgottenEntry(entry, true);
                      else store.markKnownByTerm(w.term, w.term_lang, w.native_lang, true);
                    }}
                    onRequestLogin={onRequestLogin}
                  />
                </Suspense>
              ) : (
                <WordCloud
                  entries={store.entries}
                  highlightDue={highlightDue}
                  onlyDue={onlyDue}
                  sort={sort}
                  lang={cloudLang}
                  grouping={grouping}
                  addedWindow={addedWindow}
                  onSelect={onSelectTag}
                  onDelete={store.deleteEntry}
                  onMarkKnown={store.markKnownEntry}
                  onReview={setReviewQueue}
                />
              )}
            </section>
          )}

          {detailPanel}
        </main>
      </div>

      {reviewQueue && (
        <ReviewSession
          queue={reviewQueue}
          onGrade={store.gradeReview}
          onUndo={store.undoReview}
          onLookupDetails={lookupDetails}
          onClose={() => setReviewQueue(null)}
        />
      )}

      {listening && (
        <ListenSession entries={store.entries} lang={cloudLang} onClose={() => setListening(false)} />
      )}

      {managing && isAdmin && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {customDict && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {theming && (
        <Suspense fallback={null}>
          <ThemeSettings onClose={() => setTheming(false)} loadStreak={() => loadReviewStreak(userId)} />
        </Suspense>
      )}

      {quickAdd && (
        <Suspense fallback={null}>
          <QuickAdd
            pair={pair}
            initialTerm={quickAdd.term}
            loggedIn={email != null}
            onRequestLogin={() => {
              setQuickAdd(null);
              onRequestLogin();
            }}
            onRecordSrs={store.recordLookup}
            onClose={() => setQuickAdd(null)}
            onSaved={() => {
              syncDicts(); // đẩy hộp thư lượm nhặt lên (nếu Premium)
              // Đang mở chi tiết một từ thì tra lại để từ vừa lưu (nguồn Trên máy) hiện ra.
              if (view?.kind === "detail") lookup(view.term);
            }}
          />
        </Suspense>
      )}

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

      {reviewStats && (
        <Suspense fallback={null}>
          <ReviewStats
            userId={userId}
            entries={store.entries}
            isPremium={isPremium}
            onOpenPremium={() => {
              setReviewStats(false);
              setPremium(true);
            }}
            onClose={() => setReviewStats(false)}
          />
        </Suspense>
      )}

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

      {onboarding && (
        // Cài xong gói đề xuất thì chuyển nguồn tra sang local NHƯNG không lưu
        // (setDictSource, không chooseSource): cùng ngữ nghĩa với auto-default
        // lúc mount — lựa chọn chỉ được ghi khi người dùng tự chọn ở dropdown.
        <Onboarding pair={pair} onImported={() => setDictSource("local")} onClose={closeOnboarding} />
      )}

      {/* Subtree riêng, subscribe thẳng vào kho toast module-level — toast tự
          tắt không còn kéo theo re-render MainApp (và Word Cloud cả nghìn nút). */}
      <ToastHost />
    </div>
  );
}
