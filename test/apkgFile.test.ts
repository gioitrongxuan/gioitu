import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ApkgArchive, readAnkiDatabase, readMediaMap } from "@/features/vocabstudy/data/apkgFile";
import { SqliteFile } from "@/features/vocabstudy/domain/sqlite";
import { readAnkiCollection } from "@/features/vocabstudy/domain/ankiDeck";
import { buildZip } from "./apkgFixture";

const COLLECTION = readFileSync(fileURLToPath(new URL("./fixtures/anki-sample.anki2", import.meta.url)));

/** Bản đồ media của gói thật: entry mang tên số, tên tệp thật nằm trong JSON. */
const MEDIA_MAP = JSON.stringify({ "0": "N1_0001_1.mp3", "1": "anh.jpg" });

/** Một gói `.apkg` hoàn chỉnh, dựng đúng như Anki ghi ra: cơ sở dữ liệu nén
 *  deflate, còn media chép thẳng (media vốn đã là định dạng nén sẵn). */
function buildApkg(): Blob {
  return new Blob([
    buildZip([
      { name: "collection.anki2", data: COLLECTION, deflate: true },
      { name: "media", data: Buffer.from(MEDIA_MAP, "utf8"), deflate: true },
      { name: "0", data: Buffer.from("byte-mp3") },
      { name: "1", data: Buffer.from("byte-jpg") },
    ]),
  ]);
}

describe("mở gói .apkg", () => {
  it("đọc được mục lục mà không nạp cả tệp", async () => {
    const archive = await ApkgArchive.open(buildApkg());
    expect(archive.names().sort()).toEqual(["0", "1", "collection.anki2", "media"]);
    expect(archive.has("collection.anki2")).toBe(true);
  });

  it("bóc cơ sở dữ liệu ra đúng từng byte", async () => {
    const archive = await ApkgArchive.open(buildApkg());
    const bytes = await readAnkiDatabase(archive);
    expect(bytes.length).toBe(COLLECTION.length);
    // Đi tiếp một nhịp nữa cho chắc: byte đúng thì bộ đọc SQLite phải chạy được
    // trên đó, chứ so độ dài thôi thì lệch nội dung vẫn lọt.
    expect(readAnkiCollection(new SqliteFile(bytes)).noteTypes[0].name).toBe("Japanese sentences");
  });

  it("bóc được tệp chép thẳng lẫn tệp nén deflate", async () => {
    const archive = await ApkgArchive.open(buildApkg());
    expect(new TextDecoder().decode(await archive.read("0"))).toBe("byte-mp3");
    expect(await archive.readText("media")).toBe(MEDIA_MAP);
  });

  it("đọc bản đồ media theo chiều tên thật → entry", async () => {
    // Thẻ Anki trỏ tới tên thật (`[sound:N1_0001_1.mp3]`) còn gói lưu theo số,
    // nên ta cần đúng chiều ngược với JSON.
    const map = await readMediaMap(await ApkgArchive.open(buildApkg()));
    expect(map.get("N1_0001_1.mp3")).toBe("0");
    expect(map.get("anh.jpg")).toBe("1");
  });

  it("gói không kèm media thì bản đồ rỗng, không phải lỗi", async () => {
    const archive = await ApkgArchive.open(
      new Blob([buildZip([{ name: "collection.anki2", data: COLLECTION, deflate: true }])]),
    );
    expect((await readMediaMap(archive)).size).toBe(0);
  });

  it("báo rõ cách xử lý khi gặp định dạng Anki mới", async () => {
    // Gói mới nén zstd, trình duyệt không giải được. Câu báo phải chỉ ra việc
    // cần làm — nói "tệp hỏng" thì người dùng đi sửa nhầm chỗ.
    const archive = await ApkgArchive.open(
      new Blob([buildZip([{ name: "collection.anki21b", data: Buffer.from("zstd") }])]),
    );
    await expect(readAnkiDatabase(archive)).rejects.toThrow(/Hỗ trợ Anki 2\.1\.50 trở xuống/);
  });

  it("ưu tiên collection.anki21 khi gói có cả hai đời", async () => {
    // Gói xuất từ Anki 2.1.28–2.1.50 kèm thêm bản rút gọn `collection.anki2` cho
    // Anki đời cũ; lấy nhầm bản ấy là mất thẻ.
    const archive = await ApkgArchive.open(
      new Blob([
        buildZip([
          { name: "collection.anki2", data: Buffer.from("ban-rut-gon") },
          { name: "collection.anki21", data: COLLECTION, deflate: true },
        ]),
      ]),
    );
    expect((await readAnkiDatabase(archive)).length).toBe(COLLECTION.length);
  });

  it("từ chối tệp không phải gói Anki", async () => {
    const archive = await ApkgArchive.open(new Blob([buildZip([{ name: "doc.txt", data: Buffer.from("xin chào") }])]));
    await expect(readAnkiDatabase(archive)).rejects.toThrow(/có phải \.apkg không/);
  });
});
