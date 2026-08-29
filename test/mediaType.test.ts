import { describe, it, expect } from "vitest";
import { sniffMediaType } from "@/features/vocabstudy/domain/mediaType";

const bytes = (...b: number[]) => new Uint8Array(b);

/** RIFF: bốn byte đầu giống nhau, loại thật nằm ở vị trí 8. */
const riff = (kind: string) =>
  new Uint8Array([...[0x52, 0x49, 0x46, 0x46], 0, 0, 0, 0, ...[...kind].map((c) => c.charCodeAt(0))]);

describe("đoán kiểu media", () => {
  it("nhận ảnh theo chữ ký byte", () => {
    expect(sniffMediaType("a.bin", bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(sniffMediaType("a.bin", bytes(0x89, 0x50, 0x4e, 0x47))).toBe("image/png");
    expect(sniffMediaType("a.bin", bytes(0x47, 0x49, 0x46, 0x38))).toBe("image/gif");
  });

  it("nhận âm thanh theo chữ ký byte", () => {
    expect(sniffMediaType("a.bin", bytes(0x49, 0x44, 0x33))).toBe("audio/mpeg"); // thẻ ID3
    expect(sniffMediaType("a.bin", bytes(0xff, 0xfb, 0x90))).toBe("audio/mpeg"); // đồng bộ khung
    expect(sniffMediaType("a.bin", bytes(0x4f, 0x67, 0x67, 0x53))).toBe("audio/ogg");
  });

  it("phân biệt được hai loại cùng bọc RIFF", () => {
    expect(sniffMediaType("a.bin", riff("WAVE"))).toBe("audio/wav");
    expect(sniffMediaType("a.bin", riff("WEBP"))).toBe("image/webp");
  });

  it("tin byte hơn tin đuôi tệp", () => {
    // Ca có thật trong bộ JLPT Tango N1: `1670892071719.jpg` mở đầu bằng "GIF8".
    // Thẻ Anki gom ảnh từ khắp nơi nên tên một đằng ruột một nẻo là chuyện thường.
    expect(sniffMediaType("1670892071719.jpg", bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
  });

  it("ngửi không ra thì mới xét đuôi tệp", () => {
    // SVG là chữ, không có chữ ký byte nào để mà ngửi.
    expect(sniffMediaType("hinh.svg", bytes(0x3c, 0x73, 0x76, 0x67))).toBe("image/svg+xml");
    expect(sniffMediaType("am.opus", bytes(0, 0, 0))).toBe("audio/opus");
  });

  it("chịu thua thì trả kiểu chung, không đoán bừa", () => {
    expect(sniffMediaType("la.xyz", bytes(1, 2, 3))).toBe("application/octet-stream");
    expect(sniffMediaType("rong", new Uint8Array())).toBe("application/octet-stream");
  });
});
