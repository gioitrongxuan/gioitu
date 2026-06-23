// Client-side glue for illustrative images. The translate→search pipeline runs
// on the server (it holds the Pixabay key and dodges Jisho/Pixabay CORS); here
// we only model the result shape and decide when a word still needs an image.

import { VocabEntry } from "@/shared/types";

/** An image resolved for a word: a CDN URL plus a short attribution. */
export interface WordImage {
  url: string;
  source: string;
}

/**
 * Whether to attempt an image fetch for this entry. We try exactly once per
 * word: `image_checked_at` is stamped even when none is found, so a word with
 * no good image isn't re-queried on every view. Deleted words are skipped.
 */
export function shouldFetchImage(
  entry: Pick<VocabEntry, "image_checked_at" | "deleted_at">,
): boolean {
  return entry.deleted_at == null && entry.image_checked_at == null;
}
