import { describe, it, expect } from "vitest";
import {
  dataOffset,
  findCentralDirectory,
  parseCentralDirectory,
  ZIP_DEFLATE,
  ZIP_LOCAL_HEADER_SIZE,
  ZIP_STORED,
  ZIP_TAIL_BYTES,
} from "@/features/vocabstudy/domain/zip";
import { buildZip } from "./apkgFixture";

/** Khúc đuôi mà bộ đọc thật sẽ cắt ra để dò EOCD. */
function tailOf(zip: Uint8Array): Uint8Array {
  return zip.subarray(Math.max(0, zip.length - ZIP_TAIL_BYTES));
}

describe("đọc mục lục zip", () => {
  const zip = buildZip([
    { name: "collection.anki2", data: Buffer.from("SQLite format 3\0"), deflate: true, extraLocal: 9 },
    { name: "0", data: Buffer.from("mp3 bytes") },
  ]);

  it("tìm được mục lục trung tâm", () => {
    const dir = findCentralDirectory(tailOf(zip));
    expect(dir.entryCount).toBe(2);
    expect(parseCentralDirectory(zip.subarray(dir.offset, dir.offset + dir.size))).toHaveLength(2);
  });

  it("đọc đúng tên, cách nén và kích thước từng entry", () => {
    const dir = findCentralDirectory(tailOf(zip));
    const entries = parseCentralDirectory(zip.subarray(dir.offset, dir.offset + dir.size));
    expect(entries.map((e) => e.name)).toEqual(["collection.anki2", "0"]);
    expect(entries[0].method).toBe(ZIP_DEFLATE);
    expect(entries[1].method).toBe(ZIP_STORED);
    expect(entries[1].uncompressedSize).toBe("mp3 bytes".length);
  });

  it("tính offset dữ liệu theo local header, không theo mục lục", () => {
    const dir = findCentralDirectory(tailOf(zip));
    const [first] = parseCentralDirectory(zip.subarray(dir.offset, dir.offset + dir.size));
    const header = zip.subarray(first.headerOffset, first.headerOffset + ZIP_LOCAL_HEADER_SIZE);
    // Mục lục khai extra = 0, local khai 9: lấy nhầm bên nào là lệch 9 byte.
    expect(dataOffset(header, first.headerOffset)).toBe(
      first.headerOffset + ZIP_LOCAL_HEADER_SIZE + "collection.anki2".length + 9,
    );
  });

  it("không bị chữ ký EOCD giả trong chú thích đánh lừa", () => {
    // Chú thích chứa nguyên một chữ ký EOCD giả. Dò ngược thì gặp bản giả
    // TRƯỚC, nên nếu chỉ so chữ ký là đọc ra một mục lục rỗng mà không hề báo
    // lỗi — hỏng im lặng, kiểu tệ nhất. Trường "độ dài chú thích" của bản giả
    // không khớp số byte còn lại nên nó phải bị bỏ qua.
    const fake = Buffer.alloc(40);
    fake.writeUInt32LE(0x06054b50, 0);
    const tricky = buildZip([{ name: "0", data: Buffer.from("x") }], fake);
    expect(findCentralDirectory(tailOf(tricky)).entryCount).toBe(1);
  });

  it("báo lỗi rõ ràng khi không phải zip", () => {
    const junk = new Uint8Array(64);
    expect(() => findCentralDirectory(junk)).toThrow(/không phải \.apkg/i);
  });
});
