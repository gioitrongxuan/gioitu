// Lifecycle overrides on top of the SM-2 card. Pure functions only — they return
// the field patch to merge onto an entry (same idiom as `srs.gradeCard`); the
// caller persists.
//
// Delete is a tombstone, not a hard removal, so it survives last-write-wins sync
// (see `data/repository`).

import { isDue } from "./srs";
import { VocabEntry } from "@/shared/types";

/** "Xoá": tombstone the entry (kept, not hard-removed, so the deletion syncs). */
export function softDelete(now: number): Pick<VocabEntry, "deleted_at" | "updated_at"> {
  return { deleted_at: now, updated_at: now };
}

export const isDeleted = (e: { deleted_at?: number | null }): boolean => e.deleted_at != null;

/**
 * A card actually enters the review queue only if it is due AND the user has not
 * deleted it. Pure so the store's `dueEntries` stays testable.
 */
export function isReviewable(
  entry: Pick<VocabEntry, "card_state" | "next_review" | "deleted_at">,
  now: number,
): boolean {
  return !isDeleted(entry) && isDue(entry, now);
}
