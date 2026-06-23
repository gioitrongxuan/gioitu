import { describe, it, expect } from "vitest";
import { shouldFetchImage } from "@/features/review/domain/wordImage";
import {
  extractEnglishKeyword,
  pixabaySearchUrl,
  pickPixabayImage,
} from "@server/features/wordImage/wordImage";

describe("shouldFetchImage", () => {
  it("fetches a live word that has never been checked", () => {
    expect(shouldFetchImage({ image_checked_at: undefined, deleted_at: null })).toBe(true);
  });

  it("skips a word already checked, even if no image was found", () => {
    expect(shouldFetchImage({ image_checked_at: 123, deleted_at: null })).toBe(false);
  });

  it("skips a deleted word", () => {
    expect(shouldFetchImage({ image_checked_at: undefined, deleted_at: 123 })).toBe(false);
  });
});

describe("extractEnglishKeyword", () => {
  const jisho = {
    data: [
      { japanese: [{ word: "犬", reading: "いぬ" }], senses: [{ english_definitions: ["dog"] }] },
      {
        japanese: [{ word: "戌", reading: "いぬ" }],
        senses: [{ english_definitions: ["Dog (eleventh sign of the Chinese zodiac)"] }],
      },
    ],
  };

  it("takes the first English gloss of the entry matching the term", () => {
    expect(extractEnglishKeyword(jisho, "犬")).toBe("dog");
  });

  it("matches on the reading too", () => {
    expect(extractEnglishKeyword(jisho, "いぬ")).toBe("dog");
  });

  it("strips parentheticals so the search term stays clean", () => {
    expect(extractEnglishKeyword(jisho, "戌")).toBe("Dog");
  });

  it("falls back to the first result when nothing matches the term", () => {
    expect(extractEnglishKeyword(jisho, "未知")).toBe("dog");
  });

  it("returns null for an empty or malformed response", () => {
    expect(extractEnglishKeyword({ data: [] }, "x")).toBeNull();
    expect(extractEnglishKeyword({}, "x")).toBeNull();
    expect(extractEnglishKeyword(null, "x")).toBeNull();
  });
});

describe("pixabaySearchUrl", () => {
  it("targets Pixabay with the key, the keyword, and photo/safe filters", () => {
    const url = new URL(pixabaySearchUrl("dog", "KEY123"));
    expect(url.host).toBe("pixabay.com");
    expect(url.pathname).toBe("/api/");
    expect(url.searchParams.get("key")).toBe("KEY123");
    expect(url.searchParams.get("q")).toBe("dog");
    expect(url.searchParams.get("image_type")).toBe("photo");
    expect(url.searchParams.get("safesearch")).toBe("true");
  });

  it("caps an over-long keyword at 100 characters", () => {
    const url = new URL(pixabaySearchUrl("a".repeat(200), "KEY"));
    expect(url.searchParams.get("q")).toHaveLength(100);
  });
});

describe("pickPixabayImage", () => {
  it("picks the top hit's medium-size image", () => {
    const json = { hits: [{ webformatURL: "https://pixabay.com/get/x_640.jpg" }] };
    expect(pickPixabayImage(json)).toEqual({
      url: "https://pixabay.com/get/x_640.jpg",
      source: "Pixabay",
    });
  });

  it("returns null when there are no hits", () => {
    expect(pickPixabayImage({ hits: [] })).toBeNull();
    expect(pickPixabayImage({})).toBeNull();
    expect(pickPixabayImage(null)).toBeNull();
  });
});
