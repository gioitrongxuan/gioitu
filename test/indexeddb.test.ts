import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import {
  importYomitanZip,
  lookupTerm,
  suggestTerms,
  hasLocalDictionary,
} from "../src/data/yomitan";
import { putEntry, getEntry, getAllEntries, syncUserData } from "../src/data/repository";
import { makeEntry } from "./fixtures";

/** Build an in-memory Yomitan-style .zip for testing. */
async function makeYomitanZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "index.json",
    JSON.stringify({ title: "Test", sourceLanguage: "en", targetLanguage: "vi" }),
  );
  zip.file(
    "term_bank_1.json",
    JSON.stringify([
      ["resilient", "", null, "", 0, ["kiên cường", "có khả năng phục hồi"], 1, ""],
      ["ephemeral", "", null, "", 0, ["phù du, chóng tàn"], 2, ""],
    ]),
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("Yomitan import (forward, per-pair)", () => {
  beforeAll(async () => {
    const buf = await makeYomitanZip();
    await importYomitanZip(buf, { term_lang: "en", native_lang: "vi" });
  });

  it("imports terms into IndexedDB scoped to the pair", async () => {
    expect(await hasLocalDictionary("en", "vi")).toBe(true);
    expect(await hasLocalDictionary("ja", "vi")).toBe(false);
    const e = await lookupTerm("resilient", "en", "vi");
    expect(e?.definitions).toContain("kiên cường");
    expect(e?.term_lang).toBe("en");
  });

  it("does not find a term under the wrong pair", async () => {
    expect(await lookupTerm("resilient", "vi", "en")).toBeUndefined();
  });

  it("supports prefix suggestions within the pair", async () => {
    const s = await suggestTerms("e", "en", "vi");
    expect(s.map((x) => x.term)).toContain("ephemeral");
  });
});

describe("user-data repository + offline sync", () => {
  it("persists and reads back entries", async () => {
    const e = makeEntry({ user_id: "alice", term: "hello" });
    await putEntry(e);
    const back = await getEntry("alice", "hello", "en");
    expect(back?.term).toBe("hello");
    expect((await getAllEntries("alice")).length).toBeGreaterThanOrEqual(1);
  });

  it("syncUserData returns local data when backend is unreachable", async () => {
    const merged = await syncUserData("alice");
    expect(merged.some((x) => x.term === "hello")).toBe(true);
  });
});
