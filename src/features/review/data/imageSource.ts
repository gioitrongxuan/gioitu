// Thin client for the server's image endpoint (/api/word-image). The server
// owns the Pixabay key and the Jisho translation; we just ask it for a word's
// illustrative image. Returns null when there is genuinely none (the store then
// records the attempt); throws on a transport/misconfig error so the store
// leaves the word unstamped and retries on a later view.

import { WordImage } from "../domain/wordImage";

const BASE = "/api";

export async function fetchWordImage(term: string, termLang: string): Promise<WordImage | null> {
  const query = term.trim();
  if (!query) return null;
  const params = new URLSearchParams({ term: query, lang: termLang });
  const res = await fetch(`${BASE}/word-image?${params}`);
  if (!res.ok) throw new Error(`word-image HTTP ${res.status}`); // transient → not stamped
  return (await res.json()) as WordImage | null;
}
