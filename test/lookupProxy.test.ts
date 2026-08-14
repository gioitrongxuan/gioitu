import { describe, expect, it } from "vitest";
import { DictEntry } from "@/shared/db";
import { TermResult } from "@/features/dictionary/data/yomitan";
import {
  buildLookupReply,
  failedLookupReply,
  LOOKUP_REPLY_KIND,
  parseLookupParams,
  PROXY_SOURCE_ORDER,
  toProxyHits,
} from "@/features/dictionary/domain/lookupProxy";

function entry(term: string, over: Partial<DictEntry> = {}): DictEntry {
  return { term, definitions: [], term_lang: "ja", native_lang: "vi", ...over };
}

function result(term: string, over: Partial<DictEntry> = {}): TermResult {
  return { entry: entry(term, over), reasons: [], source: term };
}

describe("parseLookupParams", () => {
  it("vắng ?lookup= → không có yêu cầu", () => {
    expect(parseLookupParams(new URLSearchParams("add=勉強"))).toBeNull();
  });

  it("?lookup= rỗng (hoặc toàn khoảng trắng) cũng không phải yêu cầu", () => {
    expect(parseLookupParams(new URLSearchParams("lookup="))).toBeNull();
    expect(parseLookupParams(new URLSearchParams("lookup=%20%20"))).toBeNull();
  });

  it("chỉ có lookup → trim mặt chữ, đoán cặp theo chữ viết, chưa biết origin", () => {
    const req = parseLookupParams(new URLSearchParams("lookup=%20勉強%20"));
    expect(req).toMatchObject({ term: "勉強", openerOrigin: null });
    expect(req?.pair.id).toBe("ja-vi");
  });

  it("chữ Latin → đoán cặp Anh→Việt", () => {
    expect(parseLookupParams(new URLSearchParams("lookup=coffee"))?.pair.id).toBe("en-vi");
  });

  it("lookup_pair hợp lệ thắng phần đoán", () => {
    expect(parseLookupParams(new URLSearchParams("lookup=勉強&lookup_pair=ja-en"))?.pair.id).toBe("ja-en");
  });

  it("lookup_pair không hợp lệ → đoán lại theo chữ viết", () => {
    expect(parseLookupParams(new URLSearchParams("lookup=coffee&lookup_pair=xx-yy"))?.pair.id).toBe("en-vi");
  });

  it("lookup_origin là đích postMessage của overlay", () => {
    const req = parseLookupParams(
      new URLSearchParams("lookup=勉強&lookup_origin=" + encodeURIComponent("https://example.com")),
    );
    expect(req?.openerOrigin).toBe("https://example.com");
  });
});

describe("toProxyHits", () => {
  it("rút mặt chữ, cách đọc và một dòng nghĩa", () => {
    const hits = toProxyHits([result("勉強", { reading: "べんきょう", definitions: ["học tập", "sự học"] })]);
    expect(hits).toEqual([{ term: "勉強", reading: "べんきょう", gloss: "học tập · sự học" }]);
  });

  it("không có cách đọc → chuỗi rỗng, không phải undefined (payload đi qua postMessage)", () => {
    expect(toProxyHits([result("coffee", { definitions: ["cà phê"] })])[0].reading).toBe("");
  });

  it("gộp trùng theo (mặt chữ, cách đọc) — cùng một từ nằm ở nhiều từ điển đã cài", () => {
    const hits = toProxyHits([
      result("勉強", { reading: "べんきょう", definitions: ["học tập"] }),
      result("勉強", { reading: "べんきょう", definitions: ["sự học"] }),
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].gloss).toBe("học tập");
  });

  it("đồng âm khác mặt chữ vẫn là hai dòng", () => {
    const hits = toProxyHits([
      result("桜", { reading: "さくら", definitions: ["hoa anh đào"] }),
      result("櫻", { reading: "さくら", definitions: ["hoa anh đào (dạng cũ)"] }),
    ]);
    expect(hits.map((h) => h.term)).toEqual(["桜", "櫻"]);
  });

  it("cắt bớt theo hạn mức, giữ thứ tự đã xếp hạng", () => {
    const many = ["A", "B", "C", "D"].map((t) => result(t));
    expect(toProxyHits(many, 2).map((h) => h.term)).toEqual(["A", "B"]);
  });
});

describe("buildLookupReply", () => {
  const local = { source: "local" as const, error: null };
  const server = { source: "server" as const, error: null };

  it("nguồn trên máy đứng trước server trong thứ tự tra của proxy", () => {
    expect(PROXY_SOURCE_ORDER).toEqual(["local", "server"]);
  });

  it("có từ trên máy → trả luôn, ghi rõ nguồn", () => {
    const reply = buildLookupReply("勉強", [
      { ...local, results: [result("勉強", { definitions: ["học tập"] })] },
      { ...server, results: [result("勉強", { definitions: ["không nên dùng tới"] })] },
    ]);
    expect(reply).toMatchObject({ kind: LOOKUP_REPLY_KIND, term: "勉強", source: "local" });
    expect(reply.hits[0].gloss).toBe("học tập");
    expect(reply.error).toBeUndefined();
  });

  it("trên máy không có → lấy kết quả của server", () => {
    const reply = buildLookupReply("勉強", [
      { ...local, results: [] },
      { ...server, results: [result("勉強", { definitions: ["học tập"] })] },
    ]);
    expect(reply.source).toBe("server");
    expect(reply.hits).toHaveLength(1);
  });

  it("không nguồn nào có từ → hits rỗng, không nguồn, không lỗi", () => {
    const reply = buildLookupReply("qwertyuiop", [
      { ...local, results: [] },
      { ...server, results: [] },
    ]);
    expect(reply).toEqual({ kind: LOOKUP_REPLY_KIND, term: "qwertyuiop", hits: [], source: null });
  });

  it("rỗng vì server hỏng → kèm cờ lỗi, không báo nhầm 'không có từ'", () => {
    const reply = buildLookupReply("勉強", [
      { ...local, results: [] },
      { source: "server", results: [], error: "network" },
    ]);
    expect(reply.error).toBe("network");
    expect(reply.source).toBeNull();
  });

  it("server hỏng nhưng trên máy có từ → kết quả thắng, không kèm lỗi", () => {
    const reply = buildLookupReply("勉強", [
      { ...local, results: [result("勉強", { definitions: ["học tập"] })] },
      { source: "server", results: [], error: "network" },
    ]);
    expect(reply.source).toBe("local");
    expect(reply.error).toBeUndefined();
  });

  it("lượt tra ném ngoại lệ → vẫn trả lời, gắn cờ 'failed'", () => {
    expect(failedLookupReply("勉強")).toEqual({
      kind: LOOKUP_REPLY_KIND,
      term: "勉強",
      hits: [],
      source: null,
      error: "failed",
    });
  });
});
