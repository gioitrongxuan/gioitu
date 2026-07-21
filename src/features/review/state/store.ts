// App store: a small React hook tying the domain logic to persistence.
// Keeps the in-memory entry list in sync with IndexedDB and the cloud.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VocabEntry, ReviewGrade } from "@/shared/types";
import { pushToast, ToastAction } from "@/shared/ui/Toasts";
import { GUEST_USER_ID } from "@/features/auth/data/auth";
import { registerLookup, newKnownEntry, LookupInput } from "../domain/lookup";
import { gradeCard, learnedAtAfter, markKnown, relapse } from "../domain/srs";
import { softDelete, isDeleted, isReviewable } from "../domain/lifecycle";
import { createSyncScheduler } from "../domain/syncScheduler";
import { SyncStatus } from "../domain/syncStatus";
import { getAllEntries, putEntry, getEntry, syncUserData, SyncReport } from "../data/repository";
import { appendReviewLog } from "../data/reviewLog";
import { buildReviewLogEntry } from "../domain/reviewLog";
import { readLastSync, writeLastSync } from "../data/lastSync";
import {
  exportBackup as exportBackupFile,
  importBackup as importBackupData,
  readBackupFile,
  pickBackupFile,
} from "../data/backup";
import { requestPersistentStorage } from "@/shared/persist";

// Đồng bộ tự động sau khi ngừng thao tác một nhịp: đủ ngắn để không mất dữ liệu
// nếu đóng app đột ngột, đủ dài để gộp cả tràng chấm thẻ trong một phiên ôn
// thành ít lần đẩy. Rời tab thì flush ngay, không đợi hết nhịp này.
const AUTO_SYNC_DELAY_MS = 2500;

/** Nút "Hoàn tác" cho toast đánh dấu; chạy `undo` (bất đồng bộ) khi bấm. */
function undoAction(term: string, undo: () => Promise<void>): ToastAction {
  return {
    label: "Hoàn tác",
    onClick: () => {
      void undo().then(() => pushToast(`Đã hoàn tác “${term}”`, "info"));
    },
  };
}

/**
 * Drives the app for an authenticated user (id comes from the session).
 * `onSessionExpired` để App phản ứng khi token hết hạn (401) trong lúc đồng bộ —
 * kể cả từ luồng ngầm: đăng xuất + mời đăng nhập lại. Phụ thuộc một chiều
 * (store → App qua callback), store không biết gì về màn đăng nhập.
 */
export function useAppStore(userId: string, onSessionExpired?: () => void) {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => readLastSync(userId));

  // pushToast sống ngoài cây React (kho module-level trong Toasts.tsx): một
  // toast tự tắt sau 4s trước đây là state chung với `entries` ở đây, nên mỗi
  // lần tắt/bật lại re-render toàn bộ MainApp — kể cả Word Cloud cả nghìn nút.
  // Hàm import về là tham chiếu ổn định (module-scope), không cần đưa vào deps.

  // Giữ callback mới nhất trong ref: nếu để các hàm đồng bộ phụ thuộc trực tiếp,
  // mỗi lần App render lại chúng đổi định danh → scheduler bị dựng lại và huỷ mất
  // nhịp đồng bộ đang chờ.
  const onSessionExpiredRef = useRef(onSessionExpired);
  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  // Xử lý kết quả một lần đồng bộ, dùng chung cho: nạp lúc mount, nút "Đồng bộ",
  // và đồng bộ ngầm. Cập nhật danh sách (bỏ tombstone); ghi mốc "lần cuối" KHI
  // thành công; token hết hạn (401) phải nổi lên NGAY — kể cả từ luồng ngầm —
  // bằng toast + mời đăng nhập lại, không im lặng. Trả status để caller (App)
  // quyết phần thông báo còn lại (đồng bộ từ điển cá nhân) mà không toast trùng.
  const applySyncReport = useCallback(
    (report: SyncReport): SyncStatus => {
      setEntries(report.entries.filter((e) => !isDeleted(e)));
      if (report.status === "ok") {
        const now = Date.now();
        writeLastSync(userId, now);
        setLastSyncedAt(now);
      } else if (report.status === "unauthorized") {
        pushToast("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại", "warn");
        onSessionExpiredRef.current?.();
      }
      return report.status;
    },
    [userId],
  );

  // Initial load: local cache first, then a best-effort cloud sync. Tombstones
  // (deleted entries) are kept in storage so they sync, but never surface to the
  // UI — drop them from the in-memory list.
  useEffect(() => {
    (async () => {
      const local = await getAllEntries(userId);
      setEntries(local.filter((e) => !isDeleted(e)));
      setLoaded(true);
      applySyncReport(await syncUserData(userId));
    })().catch((e) => console.error("load failed", e));
  }, [userId, applySyncReport]);

  // Có từ đầu tiên thì xin trình duyệt lưu trữ bền: với khách, IndexedDB là bản
  // duy nhất của dữ liệu học nên cần trình duyệt cam kết không tự thu hồi. Helper
  // tự nhớ kết quả — gọi lại (kể cả khi tải trang mà đã sẵn có dữ liệu) là vô hại.
  const hasEntries = entries.length > 0;
  useEffect(() => {
    if (hasEntries) void requestPersistentStorage();
  }, [hasEntries]);

  const upsertLocal = useCallback((entry: VocabEntry) => {
    setEntries((list) => {
      const i = list.findIndex(
        (e) => e.term === entry.term && e.term_lang === entry.term_lang,
      );
      if (i === -1) return [...list, entry];
      const next = list.slice();
      next[i] = entry;
      return next;
    });
  }, []);

  // Đồng bộ dữ liệu học (SRS) rồi trả status. Không tự toast phản hồi thành
  // công/offline — App gộp chúng cho cả SRS lẫn từ điển cá nhân trong một luồng
  // "Đồng bộ" duy nhất; RIÊNG 401 (phiên hết hạn) thì applySyncReport nổi lên
  // ngay tại đây vì luồng ngầm không có App trong vòng lặp.
  const runSync = useCallback(
    (): Promise<SyncStatus> => syncUserData(userId).then(applySyncReport),
    [userId, applySyncReport],
  );

  // Đọc lại danh sách từ cache — dùng sau khi nhập backup ghi thẳng vào IndexedDB.
  const reload = useCallback(async () => {
    const local = await getAllEntries(userId);
    setEntries(local.filter((e) => !isDeleted(e)));
  }, [userId]);

  // Guest không có cloud (không token → syncUserData chỉ đọc cache), nên khỏi
  // hẹn giờ cho phí. Người đăng nhập thì mọi thay đổi tự đẩy lên sau một nhịp.
  const isGuest = userId === GUEST_USER_ID;
  const scheduler = useMemo(
    () =>
      createSyncScheduler(() => {
        void runSync().catch((e) => console.error("auto-sync failed", e));
      }, AUTO_SYNC_DELAY_MS),
    [runSync],
  );
  const scheduleSync = useCallback(() => {
    if (!isGuest) scheduler.schedule();
  }, [isGuest, scheduler]);

  // Khôi phục một bản ghi về đúng như ảnh chụp trước khi đánh dấu — nền cho nút
  // "Hoàn tác". Ghi thẳng bản cũ (kể cả updated_at cũ) để lần sync sau LWW không
  // dựng lại bản vừa bị hoàn tác.
  const restoreSnapshot = useCallback(
    async (snapshot: VocabEntry) => {
      await putEntry(snapshot);
      upsertLocal(snapshot);
      scheduleSync();
    },
    [upsertLocal, scheduleSync],
  );

  // Gỡ một từ vừa được tạo mới (đánh dấu "đã biết" cho từ chưa từng có entry):
  // tombstone để đồng bộ được, đồng thời rút khỏi danh sách hiển thị.
  const removeCreated = useCallback(
    async (created: VocabEntry) => {
      const gone: VocabEntry = { ...created, ...softDelete(Date.now()) };
      await putEntry(gone);
      setEntries((list) =>
        list.filter((e) => !(e.term === created.term && e.term_lang === created.term_lang)),
      );
      scheduleSync();
    },
    [scheduleSync],
  );

  // Rời tab / đóng trang: đẩy ngay phần đang chờ thay vì để cả buổi học nằm
  // local. Dọn lịch chờ khi đổi tài khoản (component remount theo userId).
  useEffect(() => {
    if (isGuest) return;
    const flush = () => scheduler.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      scheduler.cancel();
    };
  }, [isGuest, scheduler]);

  /** Register a confirmed lookup (SPEC 4.1) and surface relapse/gating events. */
  const recordLookup = useCallback(
    async (input: Omit<LookupInput, "user_id">) => {
      const now = Date.now();
      const existing = await getEntry(userId, input.term, input.term_lang);
      const { entry, events } = registerLookup(existing, { ...input, user_id: userId }, now);

      if (events.relapsed) pushToast(`Bạn đã quên lại từ “${entry.term}”`, "warn");
      else if (events.cardCreated) pushToast(`“${entry.term}” đã vào hàng đợi ôn tập`, "success");

      if (events.counted || events.created || events.cardCreated) {
        await putEntry(entry);
        upsertLocal(entry);
        scheduleSync();
      }
      return { entry, events };
    },
    [userId, upsertLocal, scheduleSync],
  );

  /** Grade a card in a review session (SPEC 4.4). */
  const gradeReview = useCallback(
    async (entry: VocabEntry, grade: ReviewGrade) => {
      const now = Date.now();
      // Bơm Math.random để fuzz interval REVIEW (rải ngày đến hạn). Đây là nơi
      // DUY NHẤT được dùng Math.random cho SRS — domain (srs.ts) thuần, ngẫu
      // nhiên là phụ thuộc do tầng state này inject.
      const graded = gradeCard(entry, grade, now, Math.random);
      const next: VocabEntry = {
        ...entry,
        ...graded,
        learned_at: learnedAtAfter(entry.status, graded.status, now, entry.learned_at),
        updated_at: now,
      };
      if (entry.status !== "LEARNED" && next.status === "LEARNED") {
        pushToast(`“${entry.term}” đã thuộc 🎉`, "success");
      }
      await putEntry(next);
      upsertLocal(next);
      // Ghi review_log append-only (interval trước/sau, grade, thời điểm) —
      // best-effort: lỗi ghi log KHÔNG được làm hỏng luồng chấm thẻ, nên bắt
      // riêng và console.error (không nuốt im lặng) rồi vẫn đi tiếp.
      try {
        await appendReviewLog(buildReviewLogEntry(entry, next, grade, now));
      } catch (e) {
        console.error("append review_log failed", e);
      }
      scheduleSync();
      return next;
    },
    [upsertLocal, scheduleSync],
  );

  /**
   * Hoàn tác một lượt chấm trong phiên ôn: ghi lại thẻ ở trạng thái *trước khi
   * chấm*. Bump `updated_at` để bản khôi phục thắng LWW trước bản vừa chấm đã ghi
   * (nếu không, đồng bộ sau đó sẽ resurrect bản đã chấm và nuốt mất thao tác undo).
   *
   * KHÔNG đụng tới `review_log`: nhật ký là append-only, mà lượt chấm vừa rồi ĐÃ
   * thực sự xảy ra (người dùng đã bấm nút). Undo hiếm; để nguyên dòng đã ghi là
   * cách đơn giản và trung thực nhất — append một dòng "đảo" sẽ đếm trùng, còn
   * xoá thì phá vỡ tính append-only. Thống kê về sau có thể tự đối soát nếu cần.
   */
  const undoReview = useCallback(
    async (prev: VocabEntry) => {
      const restored: VocabEntry = { ...prev, updated_at: Date.now() };
      await putEntry(restored);
      upsertLocal(restored);
      scheduleSync();
      return restored;
    },
    [upsertLocal, scheduleSync],
  );

  /** "Đã nhớ" — graduate a word straight to LEARNED (already known). */
  const markKnownEntry = useCallback(
    async (entry: VocabEntry) => {
      const now = Date.now();
      const next: VocabEntry = {
        ...entry,
        ...markKnown(now),
        learned_at: learnedAtAfter(entry.status, "LEARNED", now, entry.learned_at),
        updated_at: now,
      };
      await putEntry(next);
      upsertLocal(next);
      scheduleSync();
      pushToast(`“${entry.term}” đã thuộc 🎉`, "success");
      return next;
    },
    [upsertLocal, scheduleSync],
  );

  /**
   * "Đánh dấu đã biết" cho một từ CHƯA có trong lịch sử (điển hình: một kanji bấm
   * từ trang thống kê). Nếu đã có entry thì graduate luôn (như nút "Đã nhớ"); nếu
   * chưa, tạo mới thẳng ở trạng thái đã thuộc. Kiểm tra existing để một entry cũ
   * không bị ghi đè mất tiến độ khi có tình huống chạy đua.
   */
  const markKnownByTerm = useCallback(
    async (term: string, term_lang: string, native_lang: string, undoable = false) => {
      const now = Date.now();
      const existing = await getEntry(userId, term, term_lang);
      const next: VocabEntry = existing
        ? {
            ...existing,
            ...markKnown(now),
            learned_at: learnedAtAfter(existing.status, "LEARNED", now, existing.learned_at),
            updated_at: now,
          }
        : newKnownEntry({ user_id: userId, term, term_lang, native_lang, meaning: "" }, now);
      await putEntry(next);
      upsertLocal(next);
      scheduleSync();
      // Hoàn tác: khôi phục đúng trạng thái trước — nếu từ đã có sẵn thì trả lại
      // bản cũ; nếu vừa tạo mới thì gỡ (tombstone) để nó biến mất như chưa từng có.
      const undo = existing
        ? () => restoreSnapshot(existing)
        : () => removeCreated(next);
      pushToast(`“${term}” đã thuộc 🎉`, "success", undoable ? undoAction(term, undo) : undefined);
      return next;
    },
    [userId, upsertLocal, scheduleSync, restoreSnapshot, removeCreated],
  );

  /** "Đã quên" — relapse a learned word back into the review queue. */
  const markForgottenEntry = useCallback(
    async (entry: VocabEntry, undoable = false) => {
      const now = Date.now();
      const next: VocabEntry = { ...entry, ...relapse(entry, now), updated_at: now };
      await putEntry(next);
      upsertLocal(next);
      scheduleSync();
      pushToast(
        `“${entry.term}” đã chuyển về ôn lại`,
        "info",
        undoable ? undoAction(entry.term, () => restoreSnapshot(entry)) : undefined,
      );
      return next;
    },
    [upsertLocal, scheduleSync, restoreSnapshot],
  );

  /** "Xoá" — tombstone the word: persist the deletion (so it syncs) but drop it
   *  from the visible list. */
  const deleteEntry = useCallback(
    async (entry: VocabEntry) => {
      const tombstoned: VocabEntry = { ...entry, ...softDelete(Date.now()) };
      await putEntry(tombstoned);
      setEntries((list) =>
        list.filter((e) => !(e.term === entry.term && e.term_lang === entry.term_lang)),
      );
      scheduleSync();
      pushToast(`Đã xoá “${entry.term}”`, "info");
    },
    [scheduleSync],
  );

  /** Xuất toàn bộ dữ liệu học ra file JSON tải về. */
  const exportBackup = useCallback(async () => {
    try {
      const count = await exportBackupFile(userId);
      pushToast(`Đã xuất ${count} từ ra tệp sao lưu`, "success");
    } catch (e) {
      console.error("export backup failed", e);
      pushToast("Không xuất được tệp sao lưu", "warn");
    }
  }, [userId]);

  /**
   * Nhập dữ liệu học từ một file backup JSON: chọn file → trộn last-write-wins
   * vào kho hiện tại → đọc lại danh sách. Người đăng nhập thì hẹn đẩy bản đã trộn
   * lên cloud. Bấm Huỷ ở hộp thoại chọn file thì lặng lẽ không làm gì.
   */
  const importBackup = useCallback(async () => {
    const file = await pickBackupFile();
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      const count = await importBackupData(userId, backup);
      await reload();
      scheduleSync();
      pushToast(`Đã nhập ${count} từ từ tệp sao lưu`, "success");
    } catch (e) {
      console.error("import backup failed", e);
      pushToast((e as Error).message ?? "Không nhập được tệp sao lưu", "warn");
    }
  }, [userId, reload, scheduleSync]);

  // dueEntries phụ thuộc Date.now(): tab để mở lâu không có thay đổi entries thì
  // "đến hạn" đứng yên dù thời gian thực đã trôi qua due date của thẻ nào đó. Tick
  // mỗi phút + khi tab trở lại foreground để đếm cập nhật mà không cần thao tác gì.
  const [dueTick, setDueTick] = useState(0);
  useEffect(() => {
    const bump = () => setDueTick((t) => t + 1);
    const id = setInterval(bump, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const dueEntries = useMemo(() => {
    const now = Date.now();
    return entries.filter((e) => isReviewable(e, now));
  }, [entries, dueTick]);

  // Mastered words for the "Đã thuộc" achievement page, most recently learned
  // first. Sắp theo `learned_at` (thời điểm thuộc thật) thay vì `updated_at` —
  // cái sau nhích mỗi lần chạm entry; fallback về last_lookup_at cho entry cũ
  // chưa từng đóng dấu.
  const learnedEntries = useMemo(
    () =>
      entries
        .filter((e) => e.status === "LEARNED")
        .sort((a, b) => (b.learned_at ?? b.last_lookup_at) - (a.learned_at ?? a.last_lookup_at)),
    [entries],
  );

  return {
    userId,
    entries,
    dueEntries,
    learnedEntries,
    loaded,
    lastSyncedAt,
    recordLookup,
    gradeReview,
    undoReview,
    markKnownEntry,
    markKnownByTerm,
    markForgottenEntry,
    deleteEntry,
    runSync,
    exportBackup,
    importBackup,
    pushToast,
  };
}
