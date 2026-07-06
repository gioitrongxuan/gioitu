import { describe, it, expect } from "vitest";
import {
  appendExample,
  applyManualAdd,
  detectTermLang,
  fieldsToExample,
  fieldsToMeaning,
} from "@server/features/anki/ankiNote";
import { AnkiDeps, handleAction } from "@server/features/anki/ankiProtocol";
import { makeEntry } from "./fixtures";

const NOW = 5_000_000;
const input = {
  user_id: "u1",
  term: "猫",
  term_lang: "ja",
  native_lang: "vi",
  meaning: JSON.stringify(["con mèo"]),
  reading: "ねこ",
  pos: "noun",
  example: "猫が好きです。",
};

// A structurally-faithful slice of a real Yomitan {glossary} (Jitendex): an
// inline <style> block, POS tag spans, the gloss <ul>/<li>, an example, all
// wrapped in data-sc-content hooks.
const JITENDEX_HTML =
  '<div class="yomitan-glossary"><ol><li data-dictionary="Jitendex"><i>(★)</i>' +
  '<span><div data-sc-content="sense-group">' +
  '<span data-sc-class="tag" title="noun (common)">noun</span>' +
  '<span data-sc-class="tag" title="suru verb">suru</span>' +
  '<div data-sc-content="sense"><ul data-sc-content="glossary">' +
  "<li>full bloom (esp. of cherry blossom)</li><li>full blossom</li></ul>" +
  '<div data-sc-content="extra-info"><div data-sc-content="example-sentence-a">' +
  '<span lang="ja">さくらは満開だった。</span></div></div></div></div></span></li>' +
  '<style>.yomitan-glossary li { color: red; } td::before { content: "✕"; }</style></ol></div>';

describe("detectTermLang", () => {
  it("classifies kana/kanji as Japanese", () => {
    expect(detectTermLang("猫")).toBe("ja");
    expect(detectTermLang("ねこ")).toBe("ja");
    expect(detectTermLang("カタカナ")).toBe("ja");
  });

  it("classifies plain latin text as English", () => {
    expect(detectTermLang("cat")).toBe("en");
    expect(detectTermLang("café")).toBe("en");
  });

  it("falls back to the reading when the surface has no Japanese", () => {
    expect(detectTermLang("ABC", "えーびーしー")).toBe("ja");
  });
});

describe("fieldsToMeaning", () => {
  it("keeps each glossary line and keeps the example sentence separate", () => {
    const fields = { Glossary: "con mèo\nloài mèo", Sentence: "猫が好きです。" };
    expect(JSON.parse(fieldsToMeaning(fields))).toEqual(["con mèo", "loài mèo"]);
    expect(fieldsToExample(fields)).toBe("猫が好きです。");
  });

  it("ignores empty/whitespace lines and a missing sentence", () => {
    expect(JSON.parse(fieldsToMeaning({ Glossary: "  nghĩa \n\n" }))).toEqual(["nghĩa"]);
    expect(JSON.parse(fieldsToMeaning({}))).toEqual([]);
  });

  // Yomitan's {glossary} marker sends rich HTML (with an inline <style> block);
  // the text path must reduce it to the gloss text, never the markup or CSS.
  it("extracts only the gloss lines from a Yomitan HTML glossary (example stays separate)", () => {
    const fields = { Glossary: JITENDEX_HTML, Sentence: "井の頭公園の桜は今が満開だ。" };
    expect(JSON.parse(fieldsToMeaning(fields))).toEqual([
      "full bloom (esp. of cherry blossom)",
      "full blossom",
    ]);
    expect(fieldsToExample(fields)).toBe("井の頭公園の桜は今が満開だ。");
  });

  it("never leaks the <style>/CSS or markup into the stored meaning", () => {
    const meaning = fieldsToMeaning({ Glossary: JITENDEX_HTML });
    expect(meaning).not.toMatch(/<|>|color:|content:|✕|yomitan-glossary/);
  });

  it("falls back to a tag strip + entity decode for non-list HTML", () => {
    const meaning = fieldsToMeaning({ Glossary: "<div>hello &amp; world</div><p>second line</p>" });
    expect(JSON.parse(meaning)).toEqual(["hello & world", "second line"]);
  });
});


describe("applyManualAdd", () => {
  it("creates a fresh entry with an SRS card (manual add bypasses gating)", () => {
    const entry = applyManualAdd(undefined, input, NOW);
    expect(entry.lookup_count).toBe(1);
    expect(entry.card_state).toBe("NEW");
    expect(entry.next_review).toBe(NOW);
    expect(entry.is_custom).toBe(true);
    expect(entry.created_at).toBe(NOW);
    expect(entry.deleted_at).toBeNull();
    expect(entry.reading).toBe("ねこ");
    expect(entry.pos).toBe("noun");
    // Examples are stored as a JSON array so a word can gather several contexts.
    expect(JSON.parse(entry.example!)).toEqual(["猫が好きです。"]);
  });

  it("accumulates a new example sentence on re-add, keeping the past ones", () => {
    const existing = makeEntry({
      term: "猫",
      term_lang: "ja",
      example: JSON.stringify(["猫が好きです。"]),
    });
    const entry = applyManualAdd(existing, { ...input, example: "猫はかわいい。" }, NOW);
    expect(JSON.parse(entry.example!)).toEqual(["猫が好きです。", "猫はかわいい。"]);
  });

  it("does not duplicate an example already stored on the word", () => {
    const existing = makeEntry({
      term: "猫",
      term_lang: "ja",
      example: JSON.stringify(["猫が好きです。"]),
    });
    const entry = applyManualAdd(existing, input, NOW);
    expect(JSON.parse(entry.example!)).toEqual(["猫が好きです。"]);
  });

  it("counts a re-add and refreshes the meaning without resetting progress", () => {
    const existing = makeEntry({
      term: "猫",
      term_lang: "ja",
      lookup_count: 3,
      status: "LEARNED",
      card_state: "REVIEW",
      reps: 5,
      srs_interval: 30_240,
    });
    const entry = applyManualAdd(existing, input, NOW);
    expect(entry.lookup_count).toBe(4);
    expect(entry.card_state).toBe("REVIEW"); // progress preserved
    expect(entry.reps).toBe(5);
    expect(entry.meaning).toBe(input.meaning);
    expect(entry.updated_at).toBe(NOW);
  });

  it("creates a card for an existing entry that never got one (gating)", () => {
    const existing = makeEntry({ term: "猫", term_lang: "ja", card_state: null, lookup_count: 1 });
    const entry = applyManualAdd(existing, input, NOW);
    expect(entry.card_state).toBe("NEW");
    expect(entry.lookup_count).toBe(2);
  });

  it("resurrects a deleted word as a fresh entry", () => {
    const deleted = makeEntry({ term: "猫", term_lang: "ja", deleted_at: 1_234, lookup_count: 9 });
    const entry = applyManualAdd(deleted, input, NOW);
    expect(entry.deleted_at).toBeNull();
    expect(entry.lookup_count).toBe(1);
    expect(entry.card_state).toBe("NEW");
  });

  it("does not mutate the existing entry", () => {
    const existing = makeEntry({ term: "猫", term_lang: "ja", lookup_count: 2 });
    applyManualAdd(existing, input, NOW);
    expect(existing.lookup_count).toBe(2);
  });
});

describe("applyManualAdd — sentence_analysis (AI, Premium)", () => {
  it("lưu phân tích cho câu mới, keyed bằng chính câu đó", () => {
    const entry = applyManualAdd(
      undefined,
      { ...input, analysis: { usage: "chủ ngữ", meaning: "Tôi thích mèo." } },
      NOW,
    );
    expect(JSON.parse(entry.sentence_analysis!)).toEqual({
      "猫が好きです。": { usage: "chủ ngữ", meaning: "Tôi thích mèo." },
    });
  });

  it("giữ phân tích của các câu cũ khi thêm câu mới", () => {
    const existing = makeEntry({
      term: "猫",
      term_lang: "ja",
      example: JSON.stringify(["猫が好きです。"]),
      sentence_analysis: JSON.stringify({ "猫が好きです。": { usage: "u1", meaning: "m1" } }),
    });
    const entry = applyManualAdd(
      existing,
      { ...input, example: "猫はかわいい。", analysis: { usage: "u2", meaning: "m2" } },
      NOW,
    );
    expect(JSON.parse(entry.sentence_analysis!)).toEqual({
      "猫が好きです。": { usage: "u1", meaning: "m1" },
      "猫はかわいい。": { usage: "u2", meaning: "m2" },
    });
  });

  it("không đặt sentence_analysis khi không có analysis (user không Premium)", () => {
    const entry = applyManualAdd(undefined, input, NOW);
    expect(entry.sentence_analysis).toBeUndefined();
  });
});

describe("appendExample (accumulating sentences)", () => {
  it("wraps a first sentence as a JSON array", () => {
    expect(JSON.parse(appendExample(undefined, "猫が好きです。"))).toEqual(["猫が好きです。"]);
  });

  it("appends a new sentence, keeping the previous ones in order", () => {
    const merged = appendExample(appendExample(undefined, "A。"), "B。");
    expect(JSON.parse(merged)).toEqual(["A。", "B。"]);
  });

  it("ignores a duplicate sentence", () => {
    expect(JSON.parse(appendExample(appendExample(undefined, "A。"), "A。"))).toEqual(["A。"]);
  });

  it("migrates a legacy plain-text example into the array", () => {
    expect(JSON.parse(appendExample("旧い例文。", "新しい例文。"))).toEqual(["旧い例文。", "新しい例文。"]);
  });

  it("caps the list, keeping the most recent sentences", () => {
    let acc: string | undefined;
    for (let i = 0; i < 25; i++) acc = appendExample(acc, `文${i}`);
    const lines = JSON.parse(acc!);
    expect(lines).toHaveLength(20);
    expect(lines[0]).toBe("文5");
    expect(lines.at(-1)).toBe("文24");
  });
});

describe("handleAction (AnkiConnect protocol)", () => {
  // A user is always resolved unless a test overrides it; saveNote returns a
  // fixed id and records its last call so we can assert what was persisted.
  function makeDeps(over: Partial<AnkiDeps> = {}) {
    const calls: Array<{ userId: string; fields: unknown; opts: unknown }> = [];
    const deps: AnkiDeps = {
      resolveUser: async () => "u1",
      saveNote: async (userId, fields, opts) => {
        calls.push({ userId, fields, opts });
        return 1718;
      },
      ...over,
    };
    return { deps, calls };
  }
  const run = (action: string, params = {}, key: unknown = "tok", deps?: AnkiDeps) =>
    handleAction(action, params, key, {}, deps ?? makeDeps().deps);

  it("returns the raw version number (unwrapped, no result wrapper)", async () => {
    expect(await run("version")).toEqual({ kind: "result", value: 6 });
  });

  it("grants permission and reflects only the supported actions", async () => {
    expect(await run("requestPermission")).toEqual({
      kind: "result",
      value: { permission: "granted" },
    });
    const reflect = await run("apiReflect");
    expect(reflect).toMatchObject({ kind: "result" });
    const value = (reflect as { value: { scopes: string[]; actions: string[] } }).value;
    expect(value.scopes).toEqual(["actions"]);
    expect(value.actions).toContain("addNote");
  });

  it("exposes one virtual deck/model and the four mappable fields", async () => {
    expect(await run("deckNames")).toEqual({ kind: "result", value: ["Website Database"] });
    expect(await run("modelNames")).toEqual({ kind: "result", value: ["Website Database"] });
    expect(await run("modelFieldNames")).toEqual({
      kind: "result",
      value: ["Word", "Reading", "Glossary", "Sentence", "PartOfSpeech"],
    });
  });

  it("answers canAdd for each note (one entry per posted note)", async () => {
    const notes = [{}, {}, {}];
    expect(await run("canAddNotes", { notes })).toEqual({
      kind: "result",
      value: [true, true, true],
    });
    expect(await run("canAddNotesWithErrorDetail", { notes })).toEqual({
      kind: "result",
      value: [
        { canAdd: true, error: null },
        { canAdd: true, error: null },
        { canAdd: true, error: null },
      ],
    });
  });

  it("addNote saves the note's fields for the resolved user and returns its id", async () => {
    const { deps, calls } = makeDeps();
    const fields = { Word: "猫", Glossary: "con mèo" };
    const reply = await handleAction("addNote", { note: { fields } }, "tok", {}, deps);
    expect(reply).toEqual({ kind: "result", value: 1718 });
    expect(calls).toEqual([{ userId: "u1", fields, opts: {} }]);
  });

  it("addNote fails (and never saves) when the API key resolves to no user", async () => {
    const { deps, calls } = makeDeps({ resolveUser: async () => null });
    const reply = await handleAction("addNote", { note: { fields: { Word: "猫" } } }, "", {}, deps);
    expect(reply.kind).toBe("error");
    expect(calls).toHaveLength(0);
  });

  it("surfaces a save failure as an error reply", async () => {
    const { deps } = makeDeps({
      saveNote: async () => {
        throw new Error("Thiếu trường Word");
      },
    });
    const reply = await handleAction("addNote", { note: { fields: {} } }, "tok", {}, deps);
    expect(reply).toEqual({ kind: "error", message: "Thiếu trường Word" });
  });

  it("rejects an unknown action the AnkiConnect way", async () => {
    expect(await run("frobnicate")).toEqual({ kind: "error", message: "unsupported action" });
  });
});
