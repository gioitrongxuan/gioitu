// Pure logic for the illustrative-image pipeline. A Japanese word is first
// translated to an English keyword via Jisho, then that keyword is searched on
// Pixabay for a photo. No I/O here — wordImageStore does the fetching — so this
// all tests without a network.

/** An image resolved for a word: a CDN URL plus a short attribution. */
export interface WordImage {
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

/**
 * Pull a searchable English keyword out of a Jisho words response. Prefers the
 * entry whose written form or reading equals `term`, falling back to the first
 * result, then takes that entry's first English gloss. Parentheticals (e.g.
 * "Dog (zodiac sign)") are stripped so the search term stays clean. Returns
 * null when nothing usable is present.
 */
export function extractEnglishKeyword(json: unknown, term: string): string | null {
  const data = (json as JishoResponse)?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const match =
    data.find((e) => (e.japanese ?? []).some((j) => j.word === term || j.reading === term)) ??
    data[0];
  const defs = match.senses?.[0]?.english_definitions;
  const first = Array.isArray(defs)
    ? defs.find((d): d is string => typeof d === "string" && d.trim() !== "")
    : undefined;
  if (!first) return null;
  const cleaned = first.replace(/\s*\([^)]*\)/g, "").trim();
  return cleaned || null;
}

/** Build the Pixabay search URL for a keyword (photos only, safe-search on). */
export function pixabaySearchUrl(keyword: string, apiKey: string): string {
  const params = new URLSearchParams({
    key: apiKey,
    q: keyword.slice(0, 100), // Pixabay caps `q` at 100 characters
    image_type: "photo",
    safesearch: "true",
    per_page: "3",
  });
  return `https://pixabay.com/api/?${params}`;
}

interface PixabayHit {
  webformatURL?: unknown;
}
interface PixabayResponse {
  hits?: PixabayHit[];
}

/** Pick the top Pixabay hit's medium-size image URL, or null if there is none. */
export function pickPixabayImage(json: unknown): WordImage | null {
  const hits = (json as PixabayResponse)?.hits;
  if (!Array.isArray(hits) || hits.length === 0) return null;
  const url = hits[0]?.webformatURL;
  if (typeof url !== "string" || !url) return null;
  return { url, source: "Pixabay" };
}
