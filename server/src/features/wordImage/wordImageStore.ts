// Data layer for illustrative images: translate (Jisho) and search (Pixabay)
// over the network. The Pixabay key is a server secret (PIXABAY_API_KEY) — the
// whole reason this lives on the server and not in the browser. We run several
// keyword searches and return a de-duplicated candidate list for the user to
// vote on; pure assembly/parsing lives in wordImage.ts.

import {
  ImageCandidate,
  extractEnglishKeywords,
  mergeCandidates,
  pixabayCandidates,
  pixabaySearchUrl,
} from "./wordImage.js";

const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const JISHO_SEARCH = "https://jisho.org/api/v1/search/words";

// Breadth knobs: cast a wide net across glosses (so everyday senses like
// "OK"/"all right" are included, not just the homograph-prone first gloss),
// few hits per keyword, then round-robin merge for a diverse pool. Bounded so a
// single word can't fan out into dozens of Pixabay calls.
const MAX_ENGLISH_GLOSSES = 8;
const HITS_PER_KEYWORD = 3;
const MAX_CANDIDATES = 15;

/** Whether the feature is configured; the route 503s when it is not. */
export function isConfigured(): boolean {
  return Boolean(PIXABAY_API_KEY);
}

/** Translate a Japanese word to several English keywords via Jisho (best-effort). */
async function englishKeywords(term: string): Promise<string[]> {
  try {
    const res = await fetch(`${JISHO_SEARCH}?keyword=${encodeURIComponent(term)}`);
    if (!res.ok) return [];
    return extractEnglishKeywords(await res.json(), term, MAX_ENGLISH_GLOSSES);
  } catch {
    return []; // Jisho down — fall back to the other keywords
  }
}

/** Search Pixabay for one keyword; never throws (a bad keyword just yields none). */
async function search(keyword: string, key: string): Promise<ImageCandidate[]> {
  try {
    const res = await fetch(pixabaySearchUrl(keyword, key, HITS_PER_KEYWORD));
    if (!res.ok) return [];
    return pixabayCandidates(await res.json(), keyword);
  } catch {
    return [];
  }
}

/**
 * Gather candidate images for a word from several keyword searches:
 * its English glosses (Jisho, for Japanese), its Vietnamese meaning, and the
 * term itself. English leads since Pixabay is English-centric. Returns a
 * de-duplicated, capped list (possibly empty). Throws only if misconfigured.
 */
export async function findCandidates(
  term: string,
  termLang: string,
  nativeMeaning: string,
): Promise<ImageCandidate[]> {
  if (!PIXABAY_API_KEY) throw new Error("PIXABAY_API_KEY chưa được cấu hình");
  const query = term.trim();
  if (!query) return [];

  // Keyword priority: English glosses (best on Pixabay) → Vietnamese meaning →
  // the raw term. De-dup keywords so we don't waste calls.
  const english = termLang === "ja" ? await englishKeywords(query) : [query];
  const keywords = [...new Set([...english, nativeMeaning.trim(), query].filter(Boolean))];

  const lists = await Promise.all(keywords.map((k) => search(k, PIXABAY_API_KEY!)));
  return mergeCandidates(lists, MAX_CANDIDATES);
}
