// App store: a small React hook tying the domain logic to persistence.
// Keeps the in-memory entry list in sync with IndexedDB and the cloud.

import { useCallback, useEffect, useMemo, useState } from "react";
import { VocabEntry, ReviewGrade } from "@/shared/types";
import { Toast } from "@/shared/ui/Toasts";
import { GUEST_USER_ID } from "@/features/auth/data/auth";
import { registerLookup, newKnownEntry, LookupInput } from "../domain/lookup";
import { gradeCard, markKnown, relapse } from "../domain/srs";
import { softDelete, isDeleted, isReviewable } from "../domain/lifecycle";
import { createSyncScheduler } from "../domain/syncScheduler";
import { getAllEntries, putEntry, getEntry, syncUserData } from "../data/repository";
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

/** Drives the app for an authenticated user (id comes from the session). */
export function useAppStore(userId: string) {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loaded, setLoaded] = useState(false);

  const pushToast = useCallback((message: string, kind: Toast["kind"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  // Initial load: local cache first, then a best-effort cloud sync. Tombstones
  // (deleted entries) are kept in storage so they sync, but never surface to the
  // UI — drop them from the in-memory list.
  useEffect(() => {
    (async () => {
      const local = await getAllEntries(userId);
      setEntries(local.filter((e) => !isDeleted(e)));
      setLoaded(true);
      const merged = await syncUserData(userId);
      setEntries(merged.filter((e) => !isDeleted(e)));
    })().catch((e) => console.error("load failed", e));
  }, [userId]);

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

  // Đồng bộ dữ liệu học (SRS). Không tự toast — App gộp phản hồi cho cả SRS lẫn
  // từ điển cá nhân trong một luồng "Đồng bộ" duy nhất.
  const runSync = useCallback(async () => {
    const merged = await syncUserData(userId);
    setEntries(merged.filter((e) => !isDeleted(e)));
  }, [userId]);

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
      return entry;
    },
    [userId, pushToast, upsertLocal, scheduleSync],
  );

  /** Grade a card in a review session (SPEC 4.4). */
  const gradeReview = useCallback(
    async (entry: VocabEntry, grade: ReviewGrade) => {
      const now = Date.now();
      const next: VocabEntry = { ...entry, ...gradeCard(entry, grade, now), updated_at: now };
      if (entry.status !== "LEARNED" && next.status === "LEARNED") {
        pushToast(`“${entry.term}” đã thuộc 🎉`, "success");
      }
      await putEntry(next);
      upsertLocal(next);
      scheduleSync();
      return next;
    },
    [pushToast, upsertLocal, scheduleSync],
  );

  /**
   * Hoàn tác một lượt chấm trong phiên ôn: ghi lại thẻ ở trạng thái *trước khi
   * chấm*. Bump `updated_at` để bản khôi phục thắng LWW trước bản vừa chấm đã ghi
   * (nếu không, đồng bộ sau đó sẽ resurrect bản đã chấm và nuốt mất thao tác undo).
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
      const next: VocabEntry = { ...entry, ...markKnown(now), updated_at: now };
      await putEntry(next);
      upsertLocal(next);
      scheduleSync();
      pushToast(`“${entry.term}” đã thuộc 🎉`, "success");
      return next;
    },
    [pushToast, upsertLocal, scheduleSync],
  );

  /**
   * "Đánh dấu đã biết" cho một từ CHƯA có trong lịch sử (điển hình: một kanji bấm
   * từ trang thống kê). Nếu đã có entry thì graduate luôn (như nút "Đã nhớ"); nếu
   * chưa, tạo mới thẳng ở trạng thái đã thuộc. Kiểm tra existing để một entry cũ
   * không bị ghi đè mất tiến độ khi có tình huống chạy đua.
   */
  const markKnownByTerm = useCallback(
    async (term: string, term_lang: string, native_lang: string) => {
      const now = Date.now();
      const existing = await getEntry(userId, term, term_lang);
      const next: VocabEntry = existing
        ? { ...existing, ...markKnown(now), updated_at: now }
        : newKnownEntry({ user_id: userId, term, term_lang, native_lang, meaning: "" }, now);
      await putEntry(next);
      upsertLocal(next);
      scheduleSync();
      pushToast(`“${term}” đã thuộc 🎉`, "success");
      return next;
    },
    [userId, pushToast, upsertLocal, scheduleSync],
  );

  /** "Đã quên" — relapse a learned word back into the review queue. */
  const markForgottenEntry = useCallback(
    async (entry: VocabEntry) => {
      const now = Date.now();
      const next: VocabEntry = { ...entry, ...relapse(entry, now), updated_at: now };
      await putEntry(next);
      upsertLocal(next);
      scheduleSync();
      pushToast(`“${entry.term}” đã chuyển về ôn lại`, "info");
      return next;
    },
    [pushToast, upsertLocal, scheduleSync],
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
    [pushToast, scheduleSync],
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
  }, [userId, pushToast]);

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
  }, [userId, reload, scheduleSync, pushToast]);

  const dueEntries = useMemo(() => {
    const now = Date.now();
    return entries.filter((e) => isReviewable(e, now));
  }, [entries]);

  // Mastered words for the "Đã thuộc" achievement page, most recently learned first.
  const learnedEntries = useMemo(
    () =>
      entries
        .filter((e) => e.status === "LEARNED")
        .sort((a, b) => b.updated_at - a.updated_at),
    [entries],
  );

  return {
    userId,
    entries,
    dueEntries,
    learnedEntries,
    toasts,
    loaded,
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
