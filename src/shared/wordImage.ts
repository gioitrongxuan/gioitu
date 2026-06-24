// Pure image logic shared by the review store and the shared <WordImage>
// component (used from both the dictionary detail panel and the review card).
// It lives in `shared` — not a feature's `domain/` — because the component that
// needs it is itself shared, and `shared` must not depend on a feature.
//
// The displayed image is the highest-voted candidate; before any vote it's the
// first (most relevant) search result. Candidates come from the server (see
// review/data/imageSource); here we only decide what to show and apply votes.

import { VocabEntry, ImageCandidate } from "@/shared/types";

/** How many candidates a user may keep voted at once. */
export const MAX_VOTED_IMAGES = 3;

/** The image to show for a word, plus its caption. */
export interface DisplayImage {
  url: string;
  source?: string;
}

/**
 * Whether to fetch candidates for this entry. We fetch once: a present
 * `image_candidates` (even empty) means "already fetched". Legacy entries
 * (single `image_url`, no candidates array) re-fetch to upgrade. Deleted skip.
 */
export function shouldFetchImage(
  entry: Pick<VocabEntry, "image_candidates" | "deleted_at">,
): boolean {
  return entry.deleted_at == null && entry.image_candidates == null;
}

/** The candidate to display: highest-voted (first wins ties), else the first. */
export function displayImage(
  entry: Pick<VocabEntry, "image_candidates" | "image_url" | "image_source">,
): DisplayImage | null {
  const candidates = entry.image_candidates;
  if (candidates && candidates.length > 0) {
    const best = candidates.reduce((top, c) => (c.votes > top.votes ? c : top), candidates[0]);
    return { url: best.url, source: best.source };
  }
  // Legacy entries fetched before voting existed.
  if (entry.image_url) return { url: entry.image_url, source: entry.image_source };
  return null;
}

/** How many candidates currently carry a vote (against MAX_VOTED_IMAGES). */
export function votedCount(candidates: ImageCandidate[]): number {
  return candidates.filter((c) => c.votes > 0).length;
}

/**
 * Add one vote to a candidate (repeat to outrank others). A no-op when the cap
 * of voted candidates is reached and this one is still unvoted — the UI also
 * disables the button so this is just a guard.
 */
export function voteImage(candidates: ImageCandidate[], url: string): ImageCandidate[] {
  const target = candidates.find((c) => c.url === url);
  if (!target) return candidates;
  if (target.votes === 0 && votedCount(candidates) >= MAX_VOTED_IMAGES) return candidates;
  return candidates.map((c) => (c.url === url ? { ...c, votes: c.votes + 1 } : c));
}

/** Clear a candidate's votes (frees a slot under the cap). */
export function clearImageVote(candidates: ImageCandidate[], url: string): ImageCandidate[] {
  return candidates.map((c) => (c.url === url ? { ...c, votes: 0 } : c));
}
