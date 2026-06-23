import { describe, it, expect } from "vitest";
import {
  wikipediaHost,
  buildImageQueryUrl,
  parseImageResponse,
  shouldFetchImage,
} from "@/features/review/domain/wordImage";

describe("wikipediaHost", () => {
  it("uses the Japanese Wikipedia for Japanese terms", () => {
    expect(wikipediaHost("ja")).toBe("ja.wikipedia.org");
  });

  it("falls back to the English Wikipedia for everything else", () => {
    expect(wikipediaHost("en")).toBe("en.wikipedia.org");
    expect(wikipediaHost("vi")).toBe("en.wikipedia.org");
  });
});

describe("buildImageQueryUrl", () => {
  it("targets the term's Wikipedia, searches it, and opts into CORS", () => {
    const url = new URL(buildImageQueryUrl("犬", "ja"));
    expect(url.host).toBe("ja.wikipedia.org");
    expect(url.pathname).toBe("/w/api.php");
    expect(url.searchParams.get("origin")).toBe("*");
    expect(url.searchParams.get("generator")).toBe("search");
    expect(url.searchParams.get("gsrsearch")).toBe("犬");
    expect(url.searchParams.get("prop")).toBe("pageimages");
  });
});

describe("parseImageResponse", () => {
  it("extracts the lead-image thumbnail and a readable attribution", () => {
    const json = {
      query: {
        pages: {
          "12345": {
            title: "犬",
            thumbnail: { source: "https://upload.wikimedia.org/x/480px-Dog.jpg" },
          },
        },
      },
    };
    expect(parseImageResponse(json, "ja.wikipedia.org")).toEqual({
      url: "https://upload.wikimedia.org/x/480px-Dog.jpg",
      source: "Wikipedia: 犬",
    });
  });

  it("returns null when the matched article has no image", () => {
    const json = { query: { pages: { "1": { title: "概念" } } } };
    expect(parseImageResponse(json, "ja.wikipedia.org")).toBeNull();
  });

  it("returns null for an empty or malformed response", () => {
    expect(parseImageResponse({}, "en.wikipedia.org")).toBeNull();
    expect(parseImageResponse({ query: {} }, "en.wikipedia.org")).toBeNull();
    expect(parseImageResponse(null, "en.wikipedia.org")).toBeNull();
  });
});

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
