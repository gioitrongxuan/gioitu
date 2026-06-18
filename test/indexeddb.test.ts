import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import {
  importYomitanZip,
  lookupTerm,
  reverseLookup,
  suggestTerms,
  tokenizeMeaning,
  hasLocalDictionary,
} from "../src/data/yomitan";
import { putEntry, getEntry, getAllEntries, syncUserData } from "../src/data/repository";
import { makeEntry } from "./fixtures";

describe("tokenizeMeaning", () => {
  it("lowercases, splits on punctuation, de-dupes, keeps Unicode letters", () => {
    expect(tokenizeMeaning("Kiên cường, phục hồi; kiên!")).toEqual(["kiên", "cường", "phục", "hồi"]);
  });
});

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

describe("Yomitan import + dual index", () => {
  beforeAll(async () => {
    const buf = await makeYomitanZip();
    await importYomitanZip(buf);
  });

  it("imports terms into IndexedDB", async () => {
    expect(await hasLocalDictionary()).toBe(true);
    const e = await lookupTerm("resilient");
    expect(e?.definitions).toContain("kiên cường");
    expect(e?.term_lang).toBe("en");
  });

  it("supports prefix suggestions", async () => {
    const s = await suggestTerms("e");
    expect(s.map((x) => x.term)).toContain("ephemeral");
  });

  it("supports reverse lookup via the token index (SPEC 2.B)", async () => {
    const r = await reverseLookup("kiên cường");
    expect(r.map((x) => x.term)).toContain("resilient");
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
