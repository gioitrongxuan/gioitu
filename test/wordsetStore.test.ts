import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { getDb, _resetDbPromise } from "@/shared/db";
import {
  createWordset,
  deleteWordset,
  listWordsets,
  loadWordset,
  loadWordsetWords,
} from "@/features/vocabstudy/data/wordsets";
import { LANG_PAIRS } from "@/shared/languages";

const JA_VI = LANG_PAIRS.find((p) => p.source === "ja" && p.target === "vi")!;
const EN_VI = LANG_PAIRS.find((p) => p.source === "en" && p.target === "vi")!;

async function wipe(): Promise<void> {
  _resetDbPromise();
  const db = await getDb();
  await db.clear("wordsets");
  await db.clear("wordset_words");
}

describe("kho bộ từ (IndexedDB)", () => {
  beforeEach(wipe);

  it("tạo bộ rồi đọc lại đủ từ, cách đọc vắng lưu thành chuỗi rỗng", async () => {
    const id = await createWordset(
      { title: "JLPT N1", term_lang: "ja", native_lang: "vi", source: "paste" },
      [
        { term: "食べる", reading: "たべる", gloss: "ăn", group: "Bài 1" },
        { term: "ラーメン" },
      ],
    );

    const rows = await loadWordsetWords(id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.term === "ラーメン")?.reading).toBe("");
    expect(rows.find((r) => r.term === "食べる")).toMatchObject({ gloss: "ăn", group: "Bài 1" });
  });

  // Ba bộ tạo sát nhau nên `importedAt` có thể trùng mili-giây: phần khẳng định
  // ở đây là thứ tự KHÔNG phụ thuộc may rủi (trùng mốc thì so tên).
  it("chỉ liệt kê bộ đúng cặp ngôn ngữ, thứ tự ổn định", async () => {
    await createWordset({ title: "N5", term_lang: "ja", native_lang: "vi", source: "paste" }, [{ term: "犬" }]);
    await createWordset({ title: "N1", term_lang: "ja", native_lang: "vi", source: "paste" }, [{ term: "憂鬱" }]);
    await createWordset({ title: "TOEIC", term_lang: "en", native_lang: "vi", source: "paste" }, [{ term: "invoice" }]);

    const ja = await listWordsets(JA_VI);
    expect(ja.map((s) => s.title)).toEqual(["N1", "N5"]);
    expect((await listWordsets(EN_VI)).map((s) => s.title)).toEqual(["TOEIC"]);
  });

  it("loadWordset dựng sẵn từ cho lưới, gắn đúng cặp ngôn ngữ của bộ", async () => {
    await createWordset({ title: "N1", term_lang: "ja", native_lang: "vi", source: "paste" }, [
      { term: "食べる", reading: "たべる" },
      { term: "ラーメン" },
    ]);
    const [set] = await listWordsets(JA_VI);

    const { words } = await loadWordset(set);
    expect(words).toEqual([
      { term: "ラーメン", term_lang: "ja", native_lang: "vi" },
      { term: "食べる", reading: "たべる", term_lang: "ja", native_lang: "vi" },
    ]);
  });

  it("xoá bộ dọn sạch cả dòng lẫn metadata, không đụng bộ khác", async () => {
    const doomed = await createWordset({ title: "N5", term_lang: "ja", native_lang: "vi", source: "paste" }, [
      { term: "犬" },
      { term: "猫" },
    ]);
    const kept = await createWordset({ title: "N1", term_lang: "ja", native_lang: "vi", source: "paste" }, [
      { term: "憂鬱" },
    ]);

    await deleteWordset(doomed);

    expect(await loadWordsetWords(doomed)).toEqual([]);
    expect((await listWordsets(JA_VI)).map((s) => s.title)).toEqual(["N1"]);
    expect(await loadWordsetWords(kept)).toHaveLength(1);
  });

  it("bản chắt ghi lại bộ gốc để biết nó từ đâu ra", async () => {
    const from = await createWordset({ title: "N1", term_lang: "ja", native_lang: "vi", source: "paste" }, [
      { term: "憂鬱" },
    ]);
    await createWordset(
      { title: "N1 · chưa biết", term_lang: "ja", native_lang: "vi", source: "sieve", fromId: from },
      [{ term: "憂鬱" }],
    );

    const split = (await listWordsets(JA_VI)).find((s) => s.source === "sieve");
    expect(split?.fromId).toBe(from);
    expect(split?.count).toBe(1);
  });
});
