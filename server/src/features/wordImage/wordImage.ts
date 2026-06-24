// Pure logic for the illustrative-image pipeline. We gather candidates from
// several keyword searches (the word's English glosses via Jisho, plus the term
// and its Vietnamese meaning) and let the user pick; relevance from a single
// keyword is unreliable for verbs/abstract words (大丈夫 "OK" → "safe" → a
// padlock), so breadth + human choice beats one blind guess. No I/O here —
// wordImageStore does the fetching — so this all tests without a network.

/** One candidate image with where it came from (for the vote screen caption). */
export interface ImageCandidate {
  url: string;
  source: string;
}

interface JishoSense {
  english_definitions?: unknown;
}
interface JishoJapanese {
  word?: unknown;
  reading?: unknown;
}
interface JishoEntry {
  japanese?: JishoJapanese[];
  senses?: JishoSense[];
}
interface JishoResponse {
  data?: JishoEntry[];
}

/** Tidy one English gloss into a searchable keyword (drop "to "/articles/parens). */
function cleanGloss(gloss: string): string {
  return gloss
    .replace(/\s*\([^)]*\)/g, "") // "Dog (zodiac sign)" → "Dog"
    .replace(/^(to|a|an|the)\s+/i, "") // "to eat" → "eat", "a house" → "house"
    .trim();
}

/**
 * Pull several searchable English keywords out of a Jisho words response.
 * Prefers the entry whose written form or reading equals `term`, then flattens
 * that entry's glosses (across senses), cleans and de-duplicates them, capped to
 * `max`. Returns [] when nothing usable is present.
 */
export function extractEnglishKeywords(json: unknown, term: string, max: number): string[] {
  const data = (json as JishoResponse)?.data;
  if (!Array.isArray(data) || data.length === 0) return [];
  const match =
    data.find((e) => (e.japanese ?? []).some((j) => j.word === term || j.reading === term)) ??
    data[0];
  const out: string[] = [];
  for (const sense of match.senses ?? []) {
    const defs = sense.english_definitions;
    if (!Array.isArray(defs)) continue;
    for (const d of defs) {
      if (typeof d !== "string") continue;
      const cleaned = cleanGloss(d);
      if (cleaned && !out.includes(cleaned)) out.push(cleaned);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Build the Pixabay search URL for a keyword (photos only, safe-search on). */
export function pixabaySearchUrl(keyword: string, apiKey: string, perPage = 5): string {
  const params = new URLSearchParams({
    key: apiKey,
    q: keyword.slice(0, 100), // Pixabay caps `q` at 100 characters
    image_type: "photo",
    safesearch: "true",
    per_page: String(perPage),
  });
  return `https://pixabay.com/api/?${params}`;
}

interface PixabayHit {
  webformatURL?: unknown;
}
interface PixabayResponse {
  hits?: PixabayHit[];
}

/**
 * Turn a Pixabay response into candidates, attributing each to the keyword that
 * found it (so the vote screen can show "Pixabay · cat"). Skips malformed hits.
 */
export function pixabayCandidates(json: unknown, keyword: string): ImageCandidate[] {
  const hits = (json as PixabayResponse)?.hits;
  if (!Array.isArray(hits)) return [];
  const out: ImageCandidate[] = [];
  for (const hit of hits) {
    const url = hit?.webformatURL;
    if (typeof url === "string" && url) out.push({ url, source: `Pixabay · ${keyword}` });
  }
  return out;
}

/**
 * Merge candidate lists (in priority order), dropping duplicate image URLs and
 * capping the total. Order is preserved so the most relevant keyword's hits lead.
 */
export function mergeCandidates(lists: ImageCandidate[][], cap: number): ImageCandidate[] {
  const seen = new Set<string>();
  const out: ImageCandidate[] = [];
  for (const list of lists) {
    for (const c of list) {
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      out.push(c);
      if (out.length >= cap) return out;
    }
  }
  return out;
}
