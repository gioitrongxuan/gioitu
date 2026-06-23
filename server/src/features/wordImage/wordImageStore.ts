// Data layer for illustrative images: translate (Jisho) and search (Pixabay)
// over the network. The Pixabay key is a server secret (PIXABAY_API_KEY) — the
// whole reason this lives on the server and not in the browser.

import {
  WordImage,
  extractEnglishKeyword,
  pickPixabayImage,
  pixabaySearchUrl,
} from "./wordImage.js";

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const JISHO_SEARCH = "https://jisho.org/api/v1/search/words";

/** Whether the feature is configured; the route 503s when it is not. */
export function isConfigured(): boolean {
  return Boolean(PIXABAY_API_KEY);
}

/** Translate a Japanese word to an English keyword via Jisho (best-effort). */
async function toEnglishKeyword(term: string): Promise<string | null> {
  const res = await fetch(`${JISHO_SEARCH}?keyword=${encodeURIComponent(term)}`);
  if (!res.ok) return null;
  return extractEnglishKeyword(await res.json(), term);
}

/**
 * Find an illustrative image for a word. Japanese terms are translated to an
 * English keyword first; everything else searches on the term as-is. Returns
 * null when Pixabay has no match (a definitive "none"). Throws on a transport
 * failure so the route surfaces a retryable error instead.
 */
export async function findImage(term: string, termLang: string): Promise<WordImage | null> {
  if (!PIXABAY_API_KEY) throw new Error("PIXABAY_API_KEY chưa được cấu hình");
  const query = term.trim();
  if (!query) return null;

  // Fall back to the raw term if translation yields nothing — better than no search.
  const keyword = termLang === "ja" ? (await toEnglishKeyword(query)) ?? query : query;
  const res = await fetch(pixabaySearchUrl(keyword, PIXABAY_API_KEY));
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
  return pickPixabayImage(await res.json());
}
