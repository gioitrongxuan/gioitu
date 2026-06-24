// App store: a small React hook tying the domain logic to persistence.
// Keeps the in-memory entry list in sync with IndexedDB and the cloud.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VocabEntry, ReviewGrade, keyOf } from "@/shared/types";
import { Toast } from "@/shared/ui/Toasts";
import { registerLookup, LookupInput } from "../domain/lookup";
import { gradeCard, markKnown, relapse } from "../domain/srs";
import { softDelete, isDeleted, isReviewable } from "../domain/lifecycle";
import { shouldFetchImage, voteImage, clearImageVote } from "@/shared/wordImage";
import { fetchImageCandidates } from "../data/imageSource";
import { meaningToLines } from "@/shared/ui/MeaningView";
import { getAllEntries, putEntry, getEntry, syncUserData } from "../data/repository";

/** Drives the app for an authenticated user (id comes from the session). */
export function useAppStore(userId: string) {
  const [entries, setEntries] = useState<VocabEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Words whose image fetch is in flight, so re-renders don't fire it twice.
  const imageFetches = useRef<Set<string>>(new Set());

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
      }
      return entry;
    },
    [userId, pushToast, upsertLocal],
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
      return next;
    },
    [pushToast, upsertLocal],
  );

  /** "Đã nhớ" — graduate a word straight to LEARNED (already known). */
  const markKnownEntry = useCallback(
    async (entry: VocabEntry) => {
      const now = Date.now();
      const next: VocabEntry = { ...entry, ...markKnown(now), updated_at: now };
      await putEntry(next);
      upsertLocal(next);
      pushToast(`“${entry.term}” đã thuộc 🎉`, "success");
      return next;
    },
    [pushToast, upsertLocal],
  );

  /** "Đã quên" — relapse a learned word back into the review queue. */
  const markForgottenEntry = useCallback(
    async (entry: VocabEntry) => {
      const now = Date.now();
      const next: VocabEntry = { ...entry, ...relapse(entry, now), updated_at: now };
      await putEntry(next);
      upsertLocal(next);
      pushToast(`“${entry.term}” đã chuyển về ôn lại`, "info");
      return next;
    },
    [pushToast, upsertLocal],
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
      pushToast(`Đã xoá “${entry.term}”`, "info");
    },
    [pushToast],
  );

  /**
   * Lazily gather candidate images the first time a word is displayed.
   * Idempotent: skips words already fetched (candidates present) or in flight.
   * A network failure leaves the word unstamped so the next view retries; a
   * clean "none found" stores an empty list so we don't re-query.
   */
  const ensureImage = useCallback(
    async (entry: VocabEntry) => {
      if (!shouldFetchImage(entry)) return;
      const key = keyOf(entry);
      if (imageFetches.current.has(key)) return;
      imageFetches.current.add(key);
      try {
        const nativeMeaning = meaningToLines(entry.meaning)[0] ?? "";
        const candidates = await fetchImageCandidates(entry.term, entry.term_lang, nativeMeaning);
        const now = Date.now();
        const next: VocabEntry = {
          ...entry,
          image_candidates: candidates,
          image_checked_at: now,
          updated_at: now,
        };
        await putEntry(next);
        upsertLocal(next);
      } catch (e) {
        console.error("image fetch failed", e); // transient — retried on next view
      } finally {
        imageFetches.current.delete(key);
      }
    },
    [upsertLocal],
  );

  // Persist a new candidate list (after a vote) for an entry.
  const saveCandidates = useCallback(
    async (entry: VocabEntry, candidates: VocabEntry["image_candidates"]) => {
      const next: VocabEntry = { ...entry, image_candidates: candidates, updated_at: Date.now() };
      await putEntry(next);
      upsertLocal(next);
    },
    [upsertLocal],
  );

  /** Up-vote one candidate image (repeat to outrank others). */
  const voteImageEntry = useCallback(
    (entry: VocabEntry, url: string) =>
      saveCandidates(entry, voteImage(entry.image_candidates ?? [], url)),
    [saveCandidates],
  );

  /** Clear a candidate's votes. */
  const clearImageVoteEntry = useCallback(
    (entry: VocabEntry, url: string) =>
      saveCandidates(entry, clearImageVote(entry.image_candidates ?? [], url)),
    [saveCandidates],
  );

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

  const runSync = useCallback(async () => {
    const merged = await syncUserData(userId);
    setEntries(merged.filter((e) => !isDeleted(e)));
    pushToast("Đã đồng bộ", "success");
  }, [userId, pushToast]);

  return {
    userId,
    entries,
    dueEntries,
    learnedEntries,
    toasts,
    loaded,
    recordLookup,
    gradeReview,
    markKnownEntry,
    markForgottenEntry,
    deleteEntry,
    ensureImage,
    voteImageEntry,
    clearImageVoteEntry,
    runSync,
    pushToast,
  };
}
