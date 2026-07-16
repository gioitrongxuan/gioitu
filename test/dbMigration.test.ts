import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { openDB, type IDBPDatabase } from "idb";
import { getDb, _resetDbPromise, type DictEntry, type LocalDictionary } from "@/shared/db";

const DB_NAME = "gioitu";

// getDb() giữ một connection sống trong dbPromise; connection còn mở sẽ chặn
// deleteDatabase. Theo dõi để đóng sau mỗi test rồi mới xoá CSDL.
let openDb: IDBPDatabase | null = null;

async function openViaGetDb(): Promise<IDBPDatabase> {
  openDb = (await getDb()) as unknown as IDBPDatabase;
  return openDb;
}

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

/**
 * Dựng một CSDL hình dạng v5 — `terms` đã có `reading` trong khoá, kèm registry
 * `dictionaries` — đúng lúc Từ điển cá nhân bắt đầu ghi row custom vào `terms`.
 */
async function seedV5(rows: {
  terms: DictEntry[];
  dictionaries: LocalDictionary[];
}): Promise<void> {
  // Seed cố tình CHỈ có `by_pair` (index chắc chắn có từ sớm nhất) và bỏ
  // `by_dict`/`by_reading` để chứng minh upgrade backfill được index còn thiếu.
  const db = await openDB(DB_NAME, 5, {
    upgrade(db) {
      const terms = db.createObjectStore("terms", {
        keyPath: ["term_lang", "native_lang", "term", "reading"],
      });
      terms.createIndex("by_pair", ["term_lang", "native_lang"]);
      const dicts = db.createObjectStore("dictionaries", { keyPath: "id" });
      dicts.createIndex("by_pair", ["term_lang", "native_lang"]);
    },
  });
  const tx = db.transaction(["terms", "dictionaries"], "readwrite");
  for (const t of rows.terms) await tx.objectStore("terms").put(t);
  for (const d of rows.dictionaries) await tx.objectStore("dictionaries").put(d);
  await tx.done;
  db.close();
}

function entry(over: Partial<DictEntry> & Pick<DictEntry, "term" | "reading">): DictEntry {
  return { definitions: [], term_lang: "ja", native_lang: "vi", ...over };
}

describe("nâng cấp IndexedDB (db.ts upgrade)", () => {
  afterEach(async () => {
    if (openDb) openDb.close();
    openDb = null;
    _resetDbPromise();
    await deleteDb();
  });

  it("bump từ v5 KHÔNG xoá từ điển cá nhân trong store terms", async () => {
    const customId = "custom-1";
    await seedV5({
      dictionaries: [
        { id: customId, title: "Sổ tay", term_lang: "ja", native_lang: "vi", termCount: 1, importedAt: 1, custom: true },
      ],
      terms: [
        entry({ term: "猫", reading: "ねこ", definitions: ["con mèo"], dictId: customId }),
        // Một row của từ điển đã nhập (re-import được) — cũng phải còn nguyên.
        entry({ term: "犬", reading: "いぬ", definitions: ["con chó"], dictId: "imported-x" }),
      ],
    });

    _resetDbPromise(); // buộc mở lại → chạy upgrade 5 → hiện tại
    const db = await openViaGetDb();

    const neko = await db.get("terms", ["ja", "vi", "猫", "ねこ"]);
    expect(neko?.definitions).toContain("con mèo");
    expect(neko?.dictId).toBe(customId);

    // Registry từ điển cá nhân còn nguyên.
    const dict = await db.get("dictionaries", customId);
    expect(dict?.custom).toBe(true);

    // Row đã-nhập cũng sống sót (migration không phá huỷ).
    const inu = await db.get("terms", ["ja", "vi", "犬", "いぬ"]);
    expect(inu?.definitions).toContain("con chó");

    // Index by_dict được backfill (v5 seed không có) → liệt kê từ theo dict chạy.
    const ofCustom = await db.getAllFromIndex("terms", "by_dict", customId);
    expect(ofCustom.map((e) => e.term)).toEqual(["猫"]);
  });

  it("backfill index by_reading khi bump từ v5 (chưa có index này)", async () => {
    await seedV5({
      dictionaries: [],
      terms: [entry({ term: "桜", reading: "さくら", definitions: ["hoa anh đào"], dictId: "d" })],
    });

    _resetDbPromise();
    const db = await openViaGetDb();

    const byReading = await db.getAllFromIndex("terms", "by_reading", ["ja", "vi", "さくら"]);
    expect(byReading.map((e) => e.term)).toContain("桜");
  });

  it("CSDL mới tạo đủ 4 store", async () => {
    _resetDbPromise();
    const db = await openViaGetDb();
    expect([...db.objectStoreNames].sort()).toEqual([
      "dictionaries",
      "term_meta",
      "terms",
      "user_data",
    ]);
  });
});
