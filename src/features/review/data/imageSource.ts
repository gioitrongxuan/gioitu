// Thin client for the server's image endpoint (/api/word-image). The server
// owns the Pixabay key and the Jisho translation and returns several candidate
// photos; we hand it the word and its Vietnamese meaning (an extra search
// keyword) and turn the result into unvoted candidates. Throws on a transport/
// misconfig error so the store leaves the word unstamped and retries later.

import { ImageCandidate } from "@/shared/types";

const BASE = "/api";

export async function fetchImageCandidates(
  term: string,
  termLang: string,
  nativeMeaning: string,
): Promise<ImageCandidate[]> {
  const query = term.trim();
  if (!query) return [];
  const params = new URLSearchParams({ term: query, lang: termLang });
  if (nativeMeaning) params.set("vi", nativeMeaning);
  const res = await fetch(`${BASE}/word-image?${params}`);
  if (!res.ok) throw new Error(`word-image HTTP ${res.status}`); // transient → not stamped
  const data = (await res.json()) as { candidates?: Array<{ url: string; source?: string }> };
  return (data.candidates ?? []).map((c) => ({ url: c.url, source: c.source, votes: 0 }));
}
