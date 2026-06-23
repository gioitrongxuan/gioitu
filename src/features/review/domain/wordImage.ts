// Pure logic for attaching an illustrative image to a vocabulary word.
// We query Wikipedia (the word's own language) and reuse the top article's
// lead image — free, key-less, and CORS-enabled via `origin=*`. The actual
// fetch lives in data/imageSource; everything here stays I/O-free so it tests
// without a network.

import { VocabEntry } from "@/shared/types";

/** An illustrative image resolved for a word. */
export interface WordImage {
  /** Direct image URL (a Wikimedia thumbnail), safe to put in <img src>. */
  url: string;
  /** Human attribution, e.g. "Wikipedia: 犬". Shown as a small caption. */
  source: string;
}

/** Pick the Wikipedia whose language matches the term (Japanese vs the rest). */
export function wikipediaHost(termLang: string): string {
  return termLang === "ja" ? "ja.wikipedia.org" : "en.wikipedia.org";
}

/**
 * Build a MediaWiki action-API URL that searches for the best article matching
 * `term` and returns its lead-image thumbnail in one round-trip. `origin=*`
 * opts into anonymous CORS so the browser can call it directly.
 */
export function buildImageQueryUrl(term: string, termLang: string): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: term,
    gsrlimit: "1",
    gsrnamespace: "0", // article namespace only — skip talk/category/file pages
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "480",
    redirects: "1",
  });
  return `https://${wikipediaHost(termLang)}/w/api.php?${params}`;
}

// Minimal shape of the slice of the API response we read.
interface ApiPage {
  title?: unknown;
  thumbnail?: { source?: unknown };
}
interface ApiResponse {
  query?: { pages?: Record<string, ApiPage> };
}

/**
 * Extract the first article thumbnail from a MediaWiki query response.
 * Returns null when the response carries no usable image (no match, or the
 * matched article has no lead image) — a definitive "none", not an error.
 */
export function parseImageResponse(json: unknown, host: string): WordImage | null {
  const pages = (json as ApiResponse)?.query?.pages;
  if (!pages || typeof pages !== "object") return null;
  for (const page of Object.values(pages)) {
    const url = page?.thumbnail?.source;
    if (typeof url === "string" && url) {
      const title = typeof page.title === "string" ? page.title : "";
      return { url, source: title ? `Wikipedia: ${title}` : `Wikipedia (${host})` };
    }
  }
  return null;
}

/**
 * Whether we should attempt to fetch an image for this entry. We try exactly
 * once per word: `image_checked_at` is stamped even when none is found, so a
 * word with no good image isn't re-queried on every view. Deleted words are
 * skipped.
 */
export function shouldFetchImage(
  entry: Pick<VocabEntry, "image_checked_at" | "deleted_at">,
): boolean {
  return entry.deleted_at == null && entry.image_checked_at == null;
}
