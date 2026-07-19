import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import {
  importYomitanZip,
  lookupTerm,
  suggestTerms,
  fuzzyTerms,
  hasLocalDictionary,
} from "@/features/dictionary/data/yomitan";
import { getSource } from "@/features/dictionary/data/sources";
import { LANG_PAIRS } from "@/shared/languages";
import {
  putEntry,
  getEntry,
  getAllEntries,
  syncUserData,
  reassignEntries,
} from "@/features/review/data/repository";
import { makeEntry } from "./fixtures";

const EN_VI = LANG_PAIRS.find((p) => p.id === "en-vi")!;

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

/** A tiny JA→VI dictionary: a kanji term keyed under a kana reading. */
async function makeJaZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("index.json", JSON.stringify({ title: "JA", sourceLanguage: "ja", targetLanguage: "vi" }));
  zip.file(
    "term_bank_1.json",
    JSON.stringify([["桜", "さくら", null, "", 0, ["hoa anh đào"], 1, ""]]),
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

  it("surfaces a misspelled query via fuzzy matching", async () => {
    // A typo (dropped 'i') has no exact match but is one edit from "resilient".
    expect(await lookupTerm("resilent", "en", "vi")).toBeUndefined();
    const fuzzy = await fuzzyTerms("resilent", "en", "vi");
    expect(fuzzy.map((r) => r.entry.term)).toContain("resilient");
    expect(fuzzy[0].fuzzy).toBe(true);
  });

  it("excludes terms already shown as exact matches", async () => {
    const exclude = new Set([JSON.stringify(["resilient", ""])]);
    const fuzzy = await fuzzyTerms("resilient", "en", "vi", exclude);
    expect(fuzzy.map((r) => r.entry.term)).not.toContain("resilient");
  });

  it("finds a kanji term by its reading, including via romaji input", async () => {
    await importYomitanZip(await makeJaZip(), { term_lang: "ja", native_lang: "vi" });
    const JA_VI = LANG_PAIRS.find((p) => p.id === "ja-vi")!;

    // Typing the reading in kana finds 桜 (keyed under term 桜, reading さくら).
    const kana = await getSource("local").findTerms("さくら", JA_VI);
    expect(kana.results.map((r) => r.entry.term)).toContain("桜");

    // Typing the reading in romaji works too (sakura → さくら → 桜).
    const romaji = await getSource("local").findTerms("sakura", JA_VI);
    expect(romaji.results.map((r) => r.entry.term)).toContain("桜");
  });

  it("the local source resolves against IndexedDB; the server source does not", async () => {
    // Chosen source decides which database answers — no cross-source fallback.
    const local = await getSource("local").findTerms("resilient", EN_VI);
    expect(local.error).toBeNull();
    expect(local.results.map((r) => r.entry.term)).toContain("resilient");

    // With no backend reachable in tests, the server source reports a network
    // error (not a silent []), so the UI never mistakes it for "không tìm thấy".
    const server = await getSource("server").findTerms("resilient", EN_VI);
    expect(server).toEqual({ results: [], error: "network" });
  });
});

describe("Yomitan import — trusts index.json's language pair", () => {
  // Import zip client (#142): trước đây opts (cặp UI đang chọn) đè lên
  // sourceLanguage/targetLanguage của index.json, nên archive lệch cặp bị lưu
  // sai và "biến mất" khỏi mọi tra cứu dưới cặp thật của nó. Giờ index.json
  // thắng khi có khai báo; opts chỉ còn là fallback.
  it("uses index.json's pair even when it conflicts with the caller's opts", async () => {
    const buf = await makeJaZip(); // index.json khai ja→vi
    await importYomitanZip(buf, { term_lang: "en", native_lang: "vi" });
    expect(await hasLocalDictionary("ja", "vi")).toBe(true);
    const e = await lookupTerm("桜", "ja", "vi");
    expect(e?.definitions).toContain("hoa anh đào");
  });

  it("falls back to the caller's opts when index.json omits the pair", async () => {
    const zip = new JSZip();
    zip.file("index.json", JSON.stringify({ title: "No lang" }));
    zip.file(
      "term_bank_1.json",
      JSON.stringify([["hello", "", null, "", 0, ["xin chào"], 1, ""]]),
    );
    const buf = await zip.generateAsync({ type: "arraybuffer" });
    await importYomitanZip(buf, { term_lang: "en", native_lang: "vi" });
    expect(await hasLocalDictionary("en", "vi")).toBe(true);
    const e = await lookupTerm("hello", "en", "vi");
    expect(e?.definitions).toContain("xin chào");
  });
});

describe("Yomitan import — progress callback (#134)", () => {
  // Import lớn từng đơ UI hàng chục giây vì await từng put() một; giờ chỉ
  // await tx.done, và onProgress báo tiến độ tăng dần từ >0 tới đúng 1 ở cuối.
  it("reports monotonically increasing progress ending at 1", async () => {
    const fractions: number[] = [];
    await importYomitanZip(await makeYomitanZip(), { term_lang: "en", native_lang: "vi" }, (f) => fractions.push(f));
    expect(fractions.length).toBeGreaterThan(0);
    expect(fractions[fractions.length - 1]).toBe(1);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1]);
    }
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

  it("syncUserData reports offline and keeps local data when backend is unreachable", async () => {
    const report = await syncUserData("alice");
    expect(report.status).toBe("offline");
    expect(report.entries.some((x) => x.term === "hello")).toBe(true);
  });
});

describe("guest → account migration", () => {
  it("moves guest entries to the signed-in account", async () => {
    await putEntry(makeEntry({ user_id: "__guest__", term: "guestword" }));

    const moved = await reassignEntries("__guest__", "bob");
    expect(moved).toBe(1);

    expect(await getEntry("bob", "guestword", "en")).toBeDefined();
    expect(await getEntry("__guest__", "guestword", "en")).toBeUndefined();
  });

  it("keeps the newer copy when both guest and account have the term", async () => {
    await putEntry(makeEntry({ user_id: "__guest__", term: "dup", lookup_count: 5, updated_at: 200 }));
    await putEntry(makeEntry({ user_id: "carol", term: "dup", lookup_count: 1, updated_at: 100 }));

    await reassignEntries("__guest__", "carol");

    const back = await getEntry("carol", "dup", "en");
    expect(back?.lookup_count).toBe(5);
    expect(await getEntry("__guest__", "dup", "en")).toBeUndefined();
  });

  it("is a no-op when source and target are the same", async () => {
    expect(await reassignEntries("bob", "bob")).toBe(0);
  });
});
