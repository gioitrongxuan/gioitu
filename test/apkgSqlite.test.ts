import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseColumnNames, SqliteFile } from "@/features/vocabstudy/domain/sqlite";

/**
 * Fixture sinh bằng `sqlite3` với cỡ trang 512 — cố ý nhỏ, để 61 hàng đã đủ đẩy
 * cây b-tree lên nhiều tầng và để một hàng dài tràn qua nhiều trang, mà tệp
 * commit vào repo vẫn chỉ 16 KB. Bảng `notes` chép đúng khuôn của Anki, kể cả
 * câu chú thích có dấu phẩy nằm giữa danh sách cột.
 */
const FIXTURE = fileURLToPath(new URL("./fixtures/sqlite-sample.db", import.meta.url));

function open(): SqliteFile {
  return new SqliteFile(new Uint8Array(readFileSync(FIXTURE)));
}

describe("đọc SQLite", () => {
  it("liệt kê được các bảng", () => {
    expect(open().tableNames()).toEqual(["notes", "tiny"]);
  });

  it("đọc tên cột, bỏ qua dấu phẩy nằm trong chú thích SQL", () => {
    // Đây là ca đã cắn thật: chú thích của bảng `notes` trong Anki có dấu phẩy,
    // tách cột mà không gỡ chú thích trước là đẻ ra một cột ma rồi lệch hết
    // những cột sau nó — `flds` sẽ trỏ vào ô sai và cả bộ từ nhập ra rác.
    expect(open().columnsOf("notes")).toEqual(["id", "guid", "sfld", "flds", "weight", "raw", "empty_col"]);
  });

  it("duyệt hết mọi hàng qua các tầng của cây b-tree", () => {
    const rows = open().readTable("notes").rows;
    expect(rows).toHaveLength(61);
    // Đúng thứ tự rowid, không sót không lặp.
    expect(rows.map((r) => r.rowid)).toEqual([...Array(60)].map((_, i) => i + 1).concat(999));
  });

  it("đọc đúng từng kiểu giá trị", () => {
    const { columns, rows } = open().readTable("notes");
    const at = (name: string) => columns.indexOf(name);
    const first = rows[0];
    expect(first.values[at("guid")]).toBe("guid1");
    expect(first.values[at("sfld")]).toBe(7);
    expect(first.values[at("weight")]).toBeCloseTo(0.25);
    expect(first.values[at("raw")]).toEqual(new Uint8Array([0, 1, 255]));
    expect(first.values[at("empty_col")]).toBeNull();
    // Cột INTEGER PRIMARY KEY được ghi là NULL: giá trị thật nằm ở rowid.
    expect(first.values[at("id")]).toBeNull();
  });

  it("ghép lại được bản ghi tràn qua nhiều trang", () => {
    const { columns, rows } = open().readTable("notes");
    const long = rows[rows.length - 1];
    const flds = long.values[columns.indexOf("flds")];
    // 1500 lần hai chữ kanji: dài gấp nhiều lần một trang 512 byte, nên nội dung
    // này chỉ đúng nếu chuỗi trang tràn được đi hết và ghép đúng thứ tự.
    expect(flds).toBe("身内".repeat(1500));
    expect(long.values[columns.indexOf("sfld")]).toBe(-5);
  });

  it("báo lỗi rõ ràng khi hỏi bảng không có", () => {
    expect(() => open().readTable("khong_ton_tai")).toThrow(/không có trong gói Anki/);
  });

  it("từ chối tệp không phải SQLite", () => {
    expect(() => new SqliteFile(new Uint8Array(200))).toThrow(/Không phải tệp SQLite/);
  });
});

describe("tách tên cột từ câu CREATE TABLE", () => {
  it("bỏ ràng buộc ở cấp bảng, không nhầm thành cột", () => {
    const sql = "CREATE TABLE t (a integer, b text, PRIMARY KEY (a, b), FOREIGN KEY (b) REFERENCES u(x))";
    expect(parseColumnNames(sql)).toEqual(["a", "b"]);
  });

  it("không tách ở dấu phẩy nằm trong ngoặc của kiểu", () => {
    expect(parseColumnNames("CREATE TABLE t (a decimal(10, 2), b text)")).toEqual(["a", "b"]);
  });

  it("gỡ nháy quanh tên cột", () => {
    expect(parseColumnNames('CREATE TABLE t ("có dấu" text, `b` integer)')).toEqual(["có dấu", "b"]);
  });

  it("không coi hai dấu gạch bên trong chuỗi là chú thích", () => {
    expect(parseColumnNames("CREATE TABLE t (a text DEFAULT '-- không phải chú thích, thật', b text)")).toEqual([
      "a",
      "b",
    ]);
  });
});
