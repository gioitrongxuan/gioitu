import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import JSZip from "jszip";
import { importYomitanZip, definitionTerms } from "@/features/dictionary/data/yomitan";
import { findByDefinitionRouted } from "@/features/dictionary/data/search";
import { pairById, pairId } from "@/shared/languages";

// Nội dung cào-web thực tế (kiểu Mazii) hay lẫn NFD (dấu tổ hợp rời) và NBSP
// thay dấu cách thường — hiển thị giống hệt "cảm thông" nhưng khác byte. #172
// thất bại trên dữ liệu thật vì includes() thô không khớp qua khác biệt này.
const messyGloss = ("cảm" + " " + "thông").normalize("NFD");

// #172: gõ một cụm ở ngôn ngữ NGHĨA (vd "đồng cảm") khi đang ở cặp ja→vi phải
// vẫn ra từ tiếng Nhật có gloss chứa cụm đó, dù cách viết/âm đọc không khớp gì.
async function makeZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("index.json", JSON.stringify({ title: "Test", sourceLanguage: "ja", targetLanguage: "vi" }));
  zip.file(
    "term_bank_1.json",
    JSON.stringify([
      ["共感", "きょうかん", "n", "", 10, ["sự đồng cảm", "cảm thông"], 1, ""],
      ["犬", "いぬ", "n", "", 5, ["con chó"], 2, ""],
      ["理解", "りかい", "n", "", 3, [messyGloss], 3, ""],
    ]),
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

const jaVi = pairById(pairId("ja", "vi"));

describe("definitionTerms (client/IndexedDB): tra theo nghĩa (#172)", () => {
  beforeAll(async () => {
    await importYomitanZip(await makeZip(), { term_lang: "ja", native_lang: "vi" });
  });

  it("tìm 'đồng cảm' ra từ tiếng Nhật có gloss chứa cụm đó", async () => {
    const results = await definitionTerms("đồng cảm", "ja", "vi");
    expect(results).toHaveLength(1);
    expect(results[0].entry.term).toBe("共感");
    expect(results[0].viaDefinition).toBe(true);
  });

  it("khớp xuyên NFC/NFD và NBSP: gõ NFC thường, gloss lưu NFD + NBSP", async () => {
    const results = await definitionTerms("cảm thông", "ja", "vi");
    expect(results.map((r) => r.entry.term).sort()).toEqual(["共感", "理解"]);
  });

  it("không khớp khi cụm không nằm trong gloss của cặp", async () => {
    expect(await definitionTerms("không tồn tại đâu cả", "ja", "vi")).toEqual([]);
  });

  it("bỏ qua các (term, reading) đã có trong exclude", async () => {
    const exclude = new Set([JSON.stringify(["共感", "きょうかん"])]);
    expect(await definitionTerms("đồng cảm", "ja", "vi", exclude)).toEqual([]);
  });

  it("chuỗi rỗng trả về rỗng ngay, không quét", async () => {
    expect(await definitionTerms("   ", "ja", "vi")).toEqual([]);
  });
});

describe("findByDefinitionRouted (nguồn 'local'): đi qua facade search.ts", () => {
  it("trả kết quả từ definitionTerms qua getSource", async () => {
    const results = await findByDefinitionRouted("con chó", jaVi, new Set(), "local");
    expect(results.map((r) => r.entry.term)).toEqual(["犬"]);
  });
});

describe("findByDefinitionRouted (nguồn 'server'): nuốt lỗi mạng thành []", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mất mạng → [] (bonus lookup, không quấy người dùng)", async () => {
    vi.stubGlobal(
      "fetch",
      (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    );
    expect(await findByDefinitionRouted("đồng cảm", jaVi, new Set(), "server")).toEqual([]);
  });
});
