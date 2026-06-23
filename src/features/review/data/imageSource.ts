// Network wrapper around the pure wordImage logic. Talks to Wikipedia's
// action API directly from the browser (anonymous CORS via `origin=*`), so the
// feature needs no server and works the same offline-or-online as the rest of
// the app: once a URL is stored on the entry it syncs and the <img> loads from
// the Wikimedia CDN.

import { buildImageQueryUrl, parseImageResponse, wikipediaHost, WordImage } from "../domain/wordImage";

/**
 * Find an illustrative image for a word.
 *   • returns a WordImage when the top article has a lead image,
 *   • returns null when the API answers but offers nothing usable (a real
 *     "none" — the caller records the attempt and won't retry),
 *   • throws on a network/transport failure so the caller can retry later.
 */
export async function fetchWordImage(term: string, termLang: string): Promise<WordImage | null> {
  const query = term.trim();
  if (!query) return null;
  const res = await fetch(buildImageQueryUrl(query, termLang));
  if (!res.ok) return null; // a valid HTTP answer with no result — not a transport error
  return parseImageResponse(await res.json(), wikipediaHost(termLang));
}
