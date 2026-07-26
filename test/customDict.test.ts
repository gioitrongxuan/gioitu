import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  createLocalDictionary,
  existingTermKeys,
  upsertCustomEntries,
  listCustomEntries,
  saveCustomDict,
} from "@/features/dictionary/data/customDict";
import { lookupTerm, listLocalDictionaries } from "@/features/dictionary/data/yomitan";
import { getDb } from "@/shared/db";
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

describe("saveCustomDict (xem/sửa)", () => {
  it("listCustomEntries + lưu khớp đúng lưới: sửa nghĩa, xoá từ, đổi tên", async () => {
    const id = await createLocalDictionary({ title: "Sửa", term_lang: "ja", native_lang: "vi" });
    await upsertCustomEntries(id, "Sửa", JA_VI, [
      draft({ term: "星", reading: "ほし", gloss: "sao" }),
      draft({ term: "月", reading: "つき", gloss: "trăng" }),
    ]);
    expect(await listCustomEntries(id)).toHaveLength(2);

    // Lưới chỉ còn 星 (đã sửa nghĩa); 月 bị bỏ → phải xoá. Đổi tên từ điển.
    const n = await saveCustomDict(id, JA_VI, { title: "Tên mới" }, [
      draft({ term: "星", reading: "ほし", gloss: "ngôi sao" }),
    ]);
    expect(n).toBe(1);

    expect((await lookupTerm("星", "ja", "vi"))?.definitions).toContain("ngôi sao");
    expect(await lookupTerm("月", "ja", "vi")).toBeUndefined(); // đã xoá thật

    const mine = (await listLocalDictionaries("ja", "vi")).find((d) => d.id === id)!;
    expect(mine.title).toBe("Tên mới");
    expect(mine.termCount).toBe(1);
  });
});

describe("saveCustomDict — mốc LWW theo từ + tombstone (#166)", () => {
  it("từ không đổi giữ nguyên updatedAt, từ sửa được đóng dấu mới", async () => {
    const id = await createLocalDictionary({ title: "Dấu", term_lang: "ja", native_lang: "vi" });
    await upsertCustomEntries(id, "Dấu", JA_VI, [
      draft({ term: "海", reading: "うみ", gloss: "biển" }),
      draft({ term: "空", reading: "そら", gloss: "trời" }),
    ]);
    const before = new Map((await listCustomEntries(id)).map((e) => [e.term, e.updatedAt]));
    expect(before.get("海")).toBeTypeOf("number");

    // Đợi qua mốc ms rồi save: chỉ sửa nghĩa 空, giữ nguyên 海.
    await new Promise((r) => setTimeout(r, 5));
    await saveCustomDict(id, JA_VI, { title: "Dấu" }, [
      draft({ term: "海", reading: "うみ", gloss: "biển" }),
      draft({ term: "空", reading: "そら", gloss: "bầu trời" }),
    ]);
    const after = new Map((await listCustomEntries(id)).map((e) => [e.term, e.updatedAt]));
    expect(after.get("海")).toBe(before.get("海")); // không đổi → không đóng dấu lại
    expect(after.get("空")!).toBeGreaterThan(before.get("空")!);
  });

  it("xoá từ ghi tombstone theo khoá; thêm lại thì gỡ tombstone", async () => {
    const id = await createLocalDictionary({ title: "Mộ", term_lang: "ja", native_lang: "vi" });
    await upsertCustomEntries(id, "Mộ", JA_VI, [
      draft({ term: "森", reading: "もり", gloss: "rừng" }),
      draft({ term: "林", reading: "はやし", gloss: "rừng thưa" }),
    ]);

    await saveCustomDict(id, JA_VI, { title: "Mộ" }, [
      draft({ term: "森", reading: "もり", gloss: "rừng" }),
    ]);
    const db = await getDb();
    let dict = (await db.get("dictionaries", id))!;
    const key = JSON.stringify(["ja", "vi", "林", "はやし"]);
    expect(dict.deletedTerms).toBeDefined();
    expect(dict.deletedTerms![key]).toBeTypeOf("number");

    // Thêm lại đúng khoá đã xoá → tombstone phải biến mất để từ sống qua merge.
    await upsertCustomEntries(id, "Mộ", JA_VI, [draft({ term: "林", reading: "はやし", gloss: "rừng thưa" })]);
    dict = (await db.get("dictionaries", id))!;
    expect(dict.deletedTerms).toBeUndefined();
  });
});
