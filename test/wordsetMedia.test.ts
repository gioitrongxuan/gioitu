import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { _resetDbPromise, getDb } from "@/shared/db";
import {
  deleteWordsetMedia,
  getWordsetMedia,
  importWordsetMedia,
  wordsetMediaSize,
} from "@/features/vocabstudy/data/wordsetMedia";
import { ApkgArchive } from "@/features/vocabstudy/data/apkgFile";

/**
 * Gói giả: chỉ cần trả byte theo tên entry. Dùng `ApkgArchive` thật thì phải
 * dựng cả một tệp zip cho mỗi ca — mà thứ đang test ở đây là tầng LƯU, không
 * phải tầng đọc zip (đã có `apkgZip.test.ts` lo).
 */
function fakeArchive(files: Record<string, string>): ApkgArchive {
  return {
    has: (name: string) => name in files,
    read: async (name: string) => new TextEncoder().encode(files[name]),
  } as unknown as ApkgArchive;
}

/** Gói thật đặt tên entry là "0", "1"… còn tên thật nằm ở bản đồ media. */
const ENTRIES = new Map([
  ["N1_0001_1.mp3", "0"],
  ["N1_0001_2.mp3", "1"],
  ["anh.jpg", "2"],
]);

const ARCHIVE = fakeArchive({ "0": "am-thanh-tu", "1": "am-thanh-cau", "2": "du-lieu-anh" });

/** Gói có tệp mang chữ ký JPEG thật, để kiểm bước ngửi byte. */
const ARCHIVE_JPEG = {
  has: (name: string) => name === "2",
  read: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
} as unknown as ApkgArchive;

async function clearDb() {
  _resetDbPromise();
  const db = await getDb();
  const tx = db.transaction("wordset_media", "readwrite");
  await tx.store.clear();
  await tx.done;
}

describe("lưu media của bộ từ", () => {
  beforeEach(clearDb);

  it("bóc và ghi đúng các tệp được yêu cầu", async () => {
    const result = await importWordsetMedia("bo1", ARCHIVE, ENTRIES, ["N1_0001_1.mp3", "anh.jpg"]);
    expect(result).toEqual({ stored: 2, missing: 0, outOfSpace: false });
    expect(await (await getWordsetMedia("bo1", "anh.jpg"))?.text()).toBe("du-lieu-anh");
  });

  it("chỉ lấy tệp trong danh sách, không lấy cả gói", async () => {
    // Đây là cách 44 MB phông chữ trong gói N1 không bị bóc ra: không ai hỏi tới.
    await importWordsetMedia("bo1", ARCHIVE, ENTRIES, ["anh.jpg"]);
    expect(await getWordsetMedia("bo1", "N1_0001_2.mp3")).toBeUndefined();
  });

  it("gắn kiểu MIME để trình duyệt còn dựng được", async () => {
    // Anki không ghi kiểu MIME ở đâu cả; thiếu bước này thì <audio> nhận một
    // blob vô danh rồi từ chối phát.
    await importWordsetMedia("bo1", ARCHIVE_JPEG, ENTRIES, ["anh.jpg"]);
    expect((await getWordsetMedia("bo1", "anh.jpg"))?.type).toBe("image/jpeg");
  });

  it("đếm và báo tệp mà gói thiếu, thay vì ném lỗi", async () => {
    // Phần chữ của bộ đã ghi xong rồi: chết cả tiến trình vì thiếu một tệp âm
    // thanh là làm hỏng thứ đang lành.
    const result = await importWordsetMedia("bo1", ARCHIVE, ENTRIES, ["anh.jpg", "khong-co.mp3"]);
    expect(result).toMatchObject({ stored: 1, missing: 1 });
  });

  it("báo tiến độ tới đủ tổng số tệp", async () => {
    const seen: number[] = [];
    await importWordsetMedia("bo1", ARCHIVE, ENTRIES, ["N1_0001_1.mp3", "anh.jpg"], (done, total) => {
      expect(total).toBe(2);
      seen.push(done);
    });
    expect(seen[seen.length - 1]).toBe(2);
  });

  it("hai bộ nhập cùng một deck không giẫm lên tệp của nhau", async () => {
    // Khoá gồm cả `setId` chính vì ca này: cùng tên tệp, khác bộ.
    await importWordsetMedia("bo1", ARCHIVE, ENTRIES, ["anh.jpg"]);
    await importWordsetMedia("bo2", fakeArchive({ "2": "anh-khac" }), ENTRIES, ["anh.jpg"]);
    expect(await (await getWordsetMedia("bo1", "anh.jpg"))?.text()).toBe("du-lieu-anh");
    expect(await (await getWordsetMedia("bo2", "anh.jpg"))?.text()).toBe("anh-khac");
  });

  it("xoá media của một bộ mà không đụng bộ kia", async () => {
    // Thiếu bước này thì xoá bộ N1 xong vẫn còn 170 MB nằm lại vĩnh viễn mà
    // không giao diện nào thấy để mà dọn.
    await importWordsetMedia("bo1", ARCHIVE, ENTRIES, ["anh.jpg", "N1_0001_1.mp3"]);
    await importWordsetMedia("bo2", ARCHIVE, ENTRIES, ["anh.jpg"]);
    await deleteWordsetMedia("bo1");
    expect(await getWordsetMedia("bo1", "anh.jpg")).toBeUndefined();
    expect(await getWordsetMedia("bo1", "N1_0001_1.mp3")).toBeUndefined();
    expect(await getWordsetMedia("bo2", "anh.jpg")).toBeDefined();
  });

  it("cộng được dung lượng media của một bộ", async () => {
    await importWordsetMedia("bo1", ARCHIVE, ENTRIES, ["anh.jpg", "N1_0001_1.mp3"]);
    expect(await wordsetMediaSize("bo1")).toBe("du-lieu-anh".length + "am-thanh-tu".length);
    expect(await wordsetMediaSize("bo-khong-co")).toBe(0);
  });

  it("gói không kèm media thì không ghi gì, cũng không lỗi", async () => {
    expect(await importWordsetMedia("bo1", ARCHIVE, new Map(), [])).toEqual({
      stored: 0,
      missing: 0,
      outOfSpace: false,
    });
  });
});
