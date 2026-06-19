// App store: a small React hook tying the domain logic to persistence.
// Keeps the in-memory entry list in sync with IndexedDB and the cloud.

import { useCallback, useEffect, useMemo, useState } from "react";
import { VocabEntry } from "../domain/types";
import { registerLookup, LookupInput } from "../domain/lookup";
import { gradeCard } from "../domain/srs";
import { ReviewGrade } from "../domain/types";
import { isDue } from "../domain/srs";
import { getAllEntries, putEntry, getEntry, syncUserData } from "../data/repository";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "warn" | "success";
}

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

  // Initial load: local cache first, then a best-effort cloud sync.
  useEffect(() => {
    (async () => {
      const local = await getAllEntries(userId);
      setEntries(local);
      setLoaded(true);
      const merged = await syncUserData(userId);
      setEntries(merged);
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

  const dueEntries = useMemo(() => {
    const now = Date.now();
    return entries.filter((e) => isDue(e, now));
  }, [entries]);

  const runSync = useCallback(async () => {
    const merged = await syncUserData(userId);
    setEntries(merged);
    pushToast("Đã đồng bộ", "success");
  }, [userId, pushToast]);

  return {
    userId,
    entries,
    dueEntries,
    toasts,
    loaded,
    recordLookup,
    gradeReview,
    runSync,
    pushToast,
  };
}
