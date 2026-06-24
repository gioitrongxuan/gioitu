import { describe, it, expect } from "vitest";
import {
  shouldFetchImage,
  displayImage,
  voteImage,
  clearImageVote,
  votedCount,
  MAX_VOTED_IMAGES,
} from "@/shared/wordImage";
import { ImageCandidate } from "@/shared/types";
import {
  extractEnglishKeywords,
  pixabaySearchUrl,
  pixabayCandidates,
  mergeCandidates,
} from "@server/features/wordImage/wordImage";

const cand = (url: string, votes = 0): ImageCandidate => ({ url, source: "Pixabay", votes });

// ---------------- client: fetch guard ----------------
describe("shouldFetchImage", () => {
  it("fetches when no candidates have been gathered yet", () => {
    expect(shouldFetchImage({ image_candidates: undefined, deleted_at: null })).toBe(true);
  });

  it("skips once candidates are present, even an empty list (none found)", () => {
    expect(shouldFetchImage({ image_candidates: [], deleted_at: null })).toBe(false);
    expect(shouldFetchImage({ image_candidates: [cand("a")], deleted_at: null })).toBe(false);
  });

  it("skips a deleted word", () => {
    expect(shouldFetchImage({ image_candidates: undefined, deleted_at: 123 })).toBe(false);
  });
});

// ---------------- client: which image shows ----------------
describe("displayImage", () => {
  it("shows the first candidate before any vote", () => {
    expect(displayImage({ image_candidates: [cand("a"), cand("b")] })?.url).toBe("a");
  });

  it("shows the highest-voted candidate", () => {
    expect(displayImage({ image_candidates: [cand("a", 1), cand("b", 3)] })?.url).toBe("b");
  });

  it("keeps the first on a tie", () => {
    expect(displayImage({ image_candidates: [cand("a", 2), cand("b", 2)] })?.url).toBe("a");
  });

  it("falls back to a legacy single image, then to nothing", () => {
    expect(displayImage({ image_url: "legacy.jpg", image_source: "X" })).toEqual({
      url: "legacy.jpg",
      source: "X",
    });
    expect(displayImage({ image_candidates: [] })).toBeNull();
    expect(displayImage({})).toBeNull();
  });
});

// ---------------- client: voting ----------------
describe("voteImage / clearImageVote", () => {
  it("adds a vote and can be repeated to outrank others", () => {
    let list = [cand("a"), cand("b")];
    list = voteImage(list, "b");
    expect(list.find((c) => c.url === "b")?.votes).toBe(1);
    list = voteImage(list, "b");
    expect(list.find((c) => c.url === "b")?.votes).toBe(2);
    expect(displayImage({ image_candidates: list })?.url).toBe("b");
  });

  it("refuses to vote a new image past the cap", () => {
    const list = [cand("a", 1), cand("b", 1), cand("c", 1), cand("d")];
    expect(votedCount(list)).toBe(MAX_VOTED_IMAGES);
    const after = voteImage(list, "d"); // 4th distinct vote — rejected
    expect(after.find((c) => c.url === "d")?.votes).toBe(0);
  });

  it("still lets an already-voted image gain votes at the cap", () => {
    const list = [cand("a", 1), cand("b", 1), cand("c", 1)];
    const after = voteImage(list, "a");
    expect(after.find((c) => c.url === "a")?.votes).toBe(2);
  });

  it("clearing a vote frees a slot", () => {
    let list = [cand("a", 1), cand("b", 1), cand("c", 1)];
    list = clearImageVote(list, "c");
    expect(votedCount(list)).toBe(2);
    list = voteImage(list, "c"); // now allowed again
    expect(list.find((c) => c.url === "c")?.votes).toBe(1);
  });
});

// ---------------- server: keyword extraction ----------------
describe("extractEnglishKeywords", () => {
  const jisho = {
    data: [
      {
        japanese: [{ word: "大丈夫", reading: "だいじょうぶ" }],
        senses: [{ english_definitions: ["safe", "all right (e.g. of a zodiac sign)", "OK", "OK"] }],
      },
    ],
  };

  it("flattens, cleans and de-duplicates glosses up to the cap", () => {
    // "all right (…)" → "all right"; duplicate "OK" collapses.
    expect(extractEnglishKeywords(jisho, "大丈夫", 5)).toEqual(["safe", "all right", "OK"]);
  });

  it("strips a leading 'to ' from verbs", () => {
    const eat = { data: [{ japanese: [{ word: "食べる" }], senses: [{ english_definitions: ["to eat"] }] }] };
    expect(extractEnglishKeywords(eat, "食べる", 5)).toEqual(["eat"]);
  });

  it("returns [] for an empty or malformed response", () => {
    expect(extractEnglishKeywords({ data: [] }, "x", 5)).toEqual([]);
    expect(extractEnglishKeywords({}, "x", 5)).toEqual([]);
    expect(extractEnglishKeywords(null, "x", 5)).toEqual([]);
  });
});

// ---------------- server: Pixabay url + parse + merge ----------------
describe("pixabaySearchUrl", () => {
  it("targets Pixabay with the key, keyword and photo/safe filters", () => {
    const url = new URL(pixabaySearchUrl("cat", "KEY", 5));
    expect(url.host).toBe("pixabay.com");
    expect(url.searchParams.get("key")).toBe("KEY");
    expect(url.searchParams.get("q")).toBe("cat");
    expect(url.searchParams.get("image_type")).toBe("photo");
    expect(url.searchParams.get("safesearch")).toBe("true");
    expect(url.searchParams.get("per_page")).toBe("5");
  });
});

describe("pixabayCandidates", () => {
  it("maps hits to candidates attributed to the keyword", () => {
    const json = { hits: [{ webformatURL: "u1" }, { webformatURL: "u2" }, { notAUrl: true }] };
    expect(pixabayCandidates(json, "cat")).toEqual([
      { url: "u1", source: "Pixabay · cat" },
      { url: "u2", source: "Pixabay · cat" },
    ]);
  });

  it("returns [] for a malformed response", () => {
    expect(pixabayCandidates({}, "cat")).toEqual([]);
    expect(pixabayCandidates(null, "cat")).toEqual([]);
  });
});

describe("mergeCandidates", () => {
  it("preserves priority order, drops duplicate urls, and caps the total", () => {
    const a = [{ url: "1", source: "a" }, { url: "2", source: "a" }];
    const b = [{ url: "2", source: "b" }, { url: "3", source: "b" }, { url: "4", source: "b" }];
    expect(mergeCandidates([a, b], 3)).toEqual([
      { url: "1", source: "a" },
      { url: "2", source: "a" }, // first occurrence wins
      { url: "3", source: "b" },
    ]);
  });
});
