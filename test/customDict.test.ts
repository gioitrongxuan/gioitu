import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  createLocalDictionary,
  existingTermKeys,
  upsertCustomEntries,
} from "@/features/dictionary/data/customDict";
import { lookupTerm, listLocalDictionaries } from "@/features/dictionary/data/yomitan";
import { emptyDraft, termReadingKey, type CustomDraft } from "@/features/dictionary/domain/customEntry";
import { pairById } from "@/shared/languages";

const JA_VI = pairById("ja-vi");

function draft(over: Partial<CustomDraft>): CustomDraft {
  return { ...emptyDraft(), ...over };
}

describe("custom dictionary (IndexedDB)", () => {
  it("tạo từ điển cá nhân rỗng trong registry", async () => {
    const id = await createLocalDictionary({ title: "Sổ tay JA", term_lang: "ja", native_lang: "vi" });
    const dicts = await listLocalDictionaries("ja", "vi");
    const mine = dicts.find((d) => d.id === id);
    expect(mine).toBeTruthy();
    expect(mine!.custom).toBe(true);
    expect(mine!.termCount).toBe(0);
  });

  it("lưu các dòng nháp rồi tra được, và cập nhật termCount", async () => {
    const id = await createLocalDictionary({ title: "Động vật", term_lang: "ja", native_lang: "vi" });
    const saved = await upsertCustomEntries(id, "Động vật", JA_VI, [
      draft({ term: "猫", reading: "ねこ", pos: "n", gloss: "con mèo" }),
      draft({ term: "犬", reading: "いぬ", pos: "n", gloss: "con chó; chó nhà" }),
    ]);
    expect(saved).toBe(2);

    const neko = await lookupTerm("猫", "ja", "vi");
    expect(neko?.definitions).toContain("con mèo");
    expect(neko?.dictId).toBe(id);

    const inu = await lookupTerm("犬", "ja", "vi");
    expect(inu?.senses?.[0].glossary).toEqual(["con chó", "chó nhà"]);

    const dicts = await listLocalDictionaries("ja", "vi");
    expect(dicts.find((d) => d.id === id)!.termCount).toBe(2);
  });

  it("existingTermKeys trả về khoá (term, reading) đã có", async () => {
    const id = await createLocalDictionary({ title: "Màu sắc", term_lang: "ja", native_lang: "vi" });
    await upsertCustomEntries(id, "Màu sắc", JA_VI, [draft({ term: "赤", reading: "あか", gloss: "màu đỏ" })]);
    const keys = await existingTermKeys("ja", "vi");
    expect(keys.has(termReadingKey("赤", "あか"))).toBe(true);
  });

  it("upsert cùng khoá thì ghi đè (không nhân đôi)", async () => {
    const id = await createLocalDictionary({ title: "Ghi đè", term_lang: "ja", native_lang: "vi" });
    await upsertCustomEntries(id, "Ghi đè", JA_VI, [draft({ term: "水", reading: "みず", gloss: "nước cũ" })]);
    const before = (await listLocalDictionaries("ja", "vi")).find((d) => d.id === id)!.termCount;

    await upsertCustomEntries(id, "Ghi đè", JA_VI, [draft({ term: "水", reading: "みず", gloss: "nước mới" })]);
    const water = await lookupTerm("水", "ja", "vi");
    expect(water?.definitions).toContain("nước mới");
    expect(water?.definitions).not.toContain("nước cũ");

    const after = (await listLocalDictionaries("ja", "vi")).find((d) => d.id === id)!.termCount;
    expect(after).toBe(before); // vẫn 1 mục cho 水/みず
  });
});
