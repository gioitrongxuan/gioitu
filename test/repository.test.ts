import { describe, it, expect } from "vitest";
import { mergeByUpdatedAt } from "../src/data/repository";
import { makeEntry } from "./fixtures";

describe("last-write-wins merge (constraint 9)", () => {
  it("keeps the entry with the newer updated_at", () => {
    const older = makeEntry({ term: "w", lookup_count: 1, updated_at: 100 });
    const newer = makeEntry({ term: "w", lookup_count: 5, updated_at: 200 });
    const merged = mergeByUpdatedAt([older], [newer]);
    expect(merged).toHaveLength(1);
    expect(merged[0].lookup_count).toBe(5);
  });

  it("unions entries keyed by (user_id, term, term_lang)", () => {
    const a = makeEntry({ term: "a", updated_at: 10 });
    const b = makeEntry({ term: "b", updated_at: 10 });
    const bJa = makeEntry({ term: "b", term_lang: "ja", updated_at: 10 });
    const merged = mergeByUpdatedAt([a, b], [bJa]);
    expect(merged).toHaveLength(3);
  });
});
