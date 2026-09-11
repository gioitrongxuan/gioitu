import { afterEach, describe, expect, it, vi } from "vitest";
import type { KanjiEntry, StructuralCategory } from "@/shared/kanji";
import { pairById } from "@/shared/languages";
import {
  buildKanjiReply,
  describeStructure,
  failedKanjiReply,
  familyCharsOf,
  familyOf,
  hanCharsOf,
  KANJI_REPLY_KIND,
  MAX_FAMILY,
  partCharsOf,
  kanjiPairFor,
  MAX_PROXY_KANJI,
  parseKanjiParams,
  toProxyKanji,
  toProxyPart,
} from "@/features/dictionary/domain/kanjiProxy";
import { runProxyKanji } from "@/features/dictionary/data/kanjiProxy";

function kanji(literal: string, over: Partial<KanjiEntry> = {}): KanjiEntry {
  return {
    literal,
    strokeCount: 1,
    components: [],
    meanings: [],
    kunyomi: [],
    onyomi: [],
    ...over,
  };
}

const byLiteral = (entries: KanjiEntry[]) => new Map(entries.map((e) => [e.literal, e]));

describe("hanCharsOf", () => {
  it("rút chữ Hán theo thứ tự xuất hiện, bỏ kana và chữ Latin", () => {
    expect(hanCharsOf("勉強する")).toEqual(["勉", "強"]);
    expect(hanCharsOf("đi học 日本語 now")).toEqual(["日", "本", "語"]);
  });

  it("chữ lặp chỉ tính một lần — một chữ chỉ có một lối cấu tạo", () => {
    expect(hanCharsOf("人人")).toEqual(["人"]);
  });

  it("không có chữ Hán → rỗng", () => {
    expect(hanCharsOf("ひらがなだけ")).toEqual([]);
    expect(hanCharsOf("")).toEqual([]);
  });

  it("cắt ở ngưỡng thẻ tối đa (bôi đen cả đoạn văn)", () => {
    const long = "一二三四五六七八九十";
    expect(hanCharsOf(long)).toHaveLength(MAX_PROXY_KANJI);
    expect(hanCharsOf(long, 3)).toEqual(["一", "二", "三"]);
  });
});

describe("parseKanjiParams", () => {
  it("vắng ?kanji= → không có yêu cầu", () => {
    expect(parseKanjiParams(new URLSearchParams("lookup=勉強"))).toBeNull();
  });

  it("?kanji= rỗng (hoặc toàn khoảng trắng) cũng không phải yêu cầu", () => {
    expect(parseKanjiParams(new URLSearchParams("kanji="))).toBeNull();
    expect(parseKanjiParams(new URLSearchParams("kanji=%20%20"))).toBeNull();
  });

  it("trim phần bôi đen, đoán cặp theo chữ viết, chưa biết origin", () => {
    const req = parseKanjiParams(new URLSearchParams("kanji=%20河%20"));
    expect(req).toMatchObject({ text: "河", openerOrigin: null });
    expect(req?.pair.id).toBe("ja-vi");
  });

  it("kanji_pair hợp lệ thắng phần đoán; không hợp lệ thì đoán lại", () => {
    expect(parseKanjiParams(new URLSearchParams("kanji=河&kanji_pair=ja-en"))?.pair.id).toBe("ja-en");
    expect(parseKanjiParams(new URLSearchParams("kanji=河&kanji_pair=xx-yy"))?.pair.id).toBe("ja-vi");
  });

  it("chuỗi không có chữ Hán vẫn là một yêu cầu hợp lệ (app trả lời 'không có chữ Hán')", () => {
    expect(parseKanjiParams(new URLSearchParams("kanji=coffee"))?.text).toBe("coffee");
  });

  it("kanji_origin là đích postMessage của overlay", () => {
    const req = parseKanjiParams(
      new URLSearchParams("kanji=河&kanji_origin=" + encodeURIComponent("https://example.com")),
    );
    expect(req?.openerOrigin).toBe("https://example.com");
  });
});

describe("kanjiPairFor", () => {
  it("bảng kanji chỉ có dòng tiếng Nhật → mọi cặp đều quy về ja→<ngôn ngữ nghĩa>", () => {
    expect(kanjiPairFor(pairById("ja-vi")).id).toBe("ja-vi");
    expect(kanjiPairFor(pairById("ja-en")).id).toBe("ja-en");
    expect(kanjiPairFor(pairById("en-vi")).id).toBe("ja-vi");
  });

  it("cặp có nghĩa là tiếng Nhật → lấy nghĩa tiếng Việt", () => {
    expect(kanjiPairFor(pairById("vi-ja")).id).toBe("ja-vi");
    expect(kanjiPairFor(pairById("en-ja")).id).toBe("ja-vi");
  });
});

describe("describeStructure", () => {
  it("chữ hình thanh kèm phần nghĩa và phần âm, mỗi phần có nghĩa + Hán-Việt của chính nó", () => {
    const parts = byLiteral([
      kanji("可", { hanViet: ["KHẢ"], meanings: ["có thể", "khá"], onyomi: [{ text: "カ" }] }),
    ]);
    const view = describeStructure({ type: "keisei", semantic: "氵", phonetic: "可" }, parts);
    expect(view?.label).toContain("Hình thanh");
    expect(view?.phonetic).toEqual({ literal: "可", hanViet: "KHẢ", meaning: "có thể", onyomi: "カ" });
    // Bộ thủ thường không có dòng riêng trong bảng kanji → chỉ còn mặt chữ.
    expect(view?.semantic).toEqual({ literal: "氵", hanViet: "", meaning: "", onyomi: "" });
  });

  it("các lối còn lại chỉ có nhãn + một câu giải thích", () => {
    const view = describeStructure({ type: "shoukei" });
    expect(view?.label).toContain("Tượng hình");
    expect(view?.hint).not.toHaveLength(0);
    expect(view?.semantic).toBeUndefined();
  });

  it("không có dữ liệu cấu tạo → null, KHÁC với 'unknown' (nguồn nói không rõ)", () => {
    expect(describeStructure(undefined)).toBeNull();
    expect(describeStructure({ type: "unknown" })?.type).toBe("unknown");
  });
});

describe("toProxyKanji", () => {
  it("gộp các trường thành chuỗi sẵn để overlay chỉ việc hiện", () => {
    const card = toProxyKanji(
      kanji("河", {
        strokeCount: 8,
        hanViet: ["HÀ"],
        meanings: ["sông", "hà"],
        onyomi: [{ text: "カ" }],
        kunyomi: [{ text: "かわ" }],
        components: ["氵", "可"],
      }),
    );
    expect(card).toMatchObject({
      literal: "河",
      hanViet: "HÀ",
      meanings: "sông; hà",
      onyomi: "カ",
      kunyomi: "かわ",
      strokeCount: 8,
    });
    expect(card.components.map((c) => c.literal)).toEqual(["氵", "可"]);
  });

  it("bỏ chính chữ đang xét khỏi danh sách bộ phận (nguồn kể cả nó)", () => {
    const card = toProxyKanji(kanji("河", { components: ["河", "氵", "可"] }));
    expect(card.components.map((c) => c.literal)).toEqual(["氵", "可"]);
  });

  it("chữ hình thanh: bộ phận không nhắc lại phần nghĩa/phần âm đã kể ở trên", () => {
    const card = toProxyKanji(
      kanji("河", {
        components: ["氵", "可", "口"],
        structuralCategory: { type: "keisei", semantic: "氵", phonetic: "可" },
      }),
    );
    // 口 là thành phần của chính phần âm 可 — cái đó chưa nói ở đâu nên giữ lại.
    expect(card.components.map((c) => c.literal)).toEqual(["口"]);
  });

  it("chữ con mang theo nghĩa + Hán-Việt của chính nó", () => {
    const parts = byLiteral([kanji("可", { hanViet: ["KHẢ"], meanings: ["có thể"] })]);
    const card = toProxyKanji(kanji("河", { components: ["氵", "可"] }), parts);
    expect(card.components[1]).toMatchObject({ literal: "可", hanViet: "KHẢ", meaning: "có thể" });
  });
});

describe("toProxyPart", () => {
  it("chữ bảng kanji không có → chỉ còn mặt chữ, các trường khác rỗng", () => {
    expect(toProxyPart("氵", new Map())).toEqual({ literal: "氵", hanViet: "", meaning: "", onyomi: "" });
  });
});

// Họ chữ cùng phần âm là thứ trả công cho việc học chiết tự: 可 kéo theo
// 何 河 荷, tất cả đọc カ.
describe("familyOf", () => {
  const head = kanji("可", { keiseiPhonetic: ["何", "河", "荷"] });

  it("chữ hình thanh → anh em cùng phần âm (bỏ chính nó)", () => {
    const entry = kanji("河", { structuralCategory: { type: "keisei", semantic: "氵", phonetic: "可" } });
    expect(familyOf(entry, byLiteral([head]))).toEqual({ phonetic: "可", members: ["何", "荷"] });
  });

  it("chữ tự làm phần âm → những chữ dựng trên nó", () => {
    expect(familyOf(head, new Map())).toEqual({ phonetic: "可", members: ["何", "河", "荷"] });
  });

  it("chưa tra được chữ làm phần âm → rơi về họ của chính nó, không bịa", () => {
    const entry = kanji("河", { structuralCategory: { type: "keisei", semantic: "氵", phonetic: "可" } });
    expect(familyOf(entry, new Map())).toBeNull();
  });

  it("chữ không dính gì tới hình thanh → không có họ", () => {
    expect(familyOf(kanji("山", { structuralCategory: { type: "shoukei" } }), new Map())).toBeNull();
  });
});

describe("thẻ chiết tự có họ chữ", () => {
  it("nêu phần âm, câu dẫn theo chiều tra, và chú thích từng chữ trong họ", () => {
    const map = byLiteral([
      kanji("可", { hanViet: ["KHẢ"], keiseiPhonetic: ["何", "河"] }),
      kanji("何", { hanViet: ["HÀ"], meanings: ["cái gì"], onyomi: [{ text: "カ" }] }),
    ]);
    const card = toProxyKanji(
      kanji("河", { structuralCategory: { type: "keisei", semantic: "氵", phonetic: "可" } }),
      map,
    );
    expect(card.family?.label).toBe("Chữ cùng phần âm 可");
    expect(card.family?.phonetic).toMatchObject({ literal: "可", hanViet: "KHẢ" });
    expect(card.family?.members[0]).toEqual({ literal: "何", hanViet: "HÀ", meaning: "cái gì", onyomi: "カ" });
  });

  it("tra chính chữ làm phần âm → câu dẫn đổi chiều", () => {
    const head = kanji("可", { keiseiPhonetic: ["何", "河"] });
    expect(toProxyKanji(head, byLiteral([head])).family?.label).toBe("Những chữ dùng 可 làm phần âm");
  });

  it("chữ hay gặp đứng trước, và cắt ở MAX_FAMILY", () => {
    const members = Array.from({ length: MAX_FAMILY + 5 }, (_, i) => String.fromCodePoint(0x4e00 + i));
    const head = kanji("可", { keiseiPhonetic: members });
    // Chữ cuối danh sách nhưng phổ biến nhất → phải nhảy lên đầu.
    const map = byLiteral([head, kanji(members[members.length - 1], { score: 99 })]);
    const family = toProxyKanji(head, map).family;
    expect(family?.members).toHaveLength(MAX_FAMILY);
    expect(family?.members[0].literal).toBe(members[members.length - 1]);
  });
});

describe("chữ cần hỏi thêm ở lượt 2 và 3", () => {
  const entry = kanji("河", {
    components: ["河", "氵", "可"],
    structuralCategory: { type: "keisei", semantic: "氵", phonetic: "可" },
  });

  it("lượt 2 = bộ phận + phần nghĩa + phần âm, trừ chữ đã tra", () => {
    expect(partCharsOf([entry]).sort()).toEqual(["可", "氵"]);
  });

  it("lượt 3 = thành viên các họ, trừ chữ đã có, cắt ở trần", () => {
    const map = byLiteral([entry, kanji("可", { keiseiPhonetic: ["何", "河", "荷"] })]);
    // 河 đã tra ở lượt 1 nên không hỏi lại; 何/荷 thì cần để có Hán-Việt + âm On.
    expect(familyCharsOf([entry], map)).toEqual(["何", "荷"]);
    expect(familyCharsOf([entry], map, 1)).toEqual(["何"]);
  });

  it("không chữ nào có họ → không có lượt 3", () => {
    expect(familyCharsOf([kanji("山")], new Map())).toEqual([]);
  });
});

describe("buildKanjiReply", () => {
  const entries = [kanji("強"), kanji("勉")];

  it("sắp thẻ theo thứ tự chữ trong phần bôi đen, không theo thứ tự hàng trả về", () => {
    const reply = buildKanjiReply("勉強", ["勉", "強"], entries);
    expect(reply.kind).toBe(KANJI_REPLY_KIND);
    expect(reply.kanji.map((k) => k.literal)).toEqual(["勉", "強"]);
    expect(reply.error).toBeUndefined();
  });

  it("chữ bảng kanji không có thì vắng thẻ, nhưng vẫn còn trong chars", () => {
    const reply = buildKanjiReply("勉々", ["勉", "々"], [kanji("勉")]);
    expect(reply.chars).toEqual(["勉", "々"]);
    expect(reply.kanji.map((k) => k.literal)).toEqual(["勉"]);
  });

  it("phần bôi đen không có chữ Hán → chars rỗng, không phải lỗi", () => {
    const reply = buildKanjiReply("coffee", [], []);
    expect(reply).toMatchObject({ chars: [], kanji: [] });
    expect(reply.error).toBeUndefined();
  });

  it("nguồn hỏng đi kèm cờ error — overlay không được báo 'chưa có dữ liệu'", () => {
    expect(buildKanjiReply("勉", ["勉"], [], "network").error).toBe("network");
    expect(failedKanjiReply("勉")).toMatchObject({ chars: [], kanji: [], error: "failed" });
  });
});

describe("lục thư — mọi mã đều có nhãn tiếng Việt", () => {
  // "keisei" có thêm phần nghĩa/âm nên đứng riêng ở describe trên.
  const types: Exclude<StructuralCategory["type"], "keisei">[] = [
    "unknown",
    "shoukei",
    "shiji",
    "kaii",
    "kokuji",
    "shinjitai",
    "derivative",
    "rebus",
  ];
  it.each(types)("%s", (type) => {
    const view = describeStructure({ type });
    expect(view?.label).toBeTruthy();
    expect(view?.hint).toBeTruthy();
  });
});

// Lớp I/O: một request cho mọi chữ, và cờ lỗi phải đi tới tận payload — overlay
// dựa vào đó để báo "không chiết tự được" thay vì "chữ này chưa có dữ liệu".
describe("runProxyKanji", () => {
  afterEach(() => vi.unstubAllGlobals());

  const okWith = (entries: KanjiEntry[]) => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(entries), { status: 200 });
    });
    return urls;
  };

  it("hỏi một lượt cho mọi chữ Hán, theo cặp đã quy về ja→vi", async () => {
    const urls = okWith([kanji("勉"), kanji("強")]);
    const reply = await runProxyKanji("勉強する", pairById("en-vi"));
    expect(urls).toHaveLength(1);
    expect(decodeURIComponent(urls[0])).toContain("chars=勉強");
    expect(decodeURIComponent(urls[0])).toContain("src=ja&tgt=vi");
    expect(reply.kanji.map((k) => k.literal)).toEqual(["勉", "強"]);
  });

  it("hỏi tiếp chữ con rồi họ chữ — ba lượt, mỗi lượt một request gộp", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(decodeURIComponent(url));
      const chars = decodeURIComponent(url).match(/chars=([^&]*)/)?.[1] ?? "";
      const rows: KanjiEntry[] = [];
      if (chars.includes("河"))
        rows.push(
          kanji("河", {
            components: ["氵", "可"],
            structuralCategory: { type: "keisei", semantic: "氵", phonetic: "可" },
          }),
        );
      if (chars.includes("可")) rows.push(kanji("可", { hanViet: ["KHẢ"], keiseiPhonetic: ["何", "河"] }));
      if (chars.includes("何")) rows.push(kanji("何", { hanViet: ["HÀ"], meanings: ["cái gì"] }));
      return new Response(JSON.stringify(rows), { status: 200 });
    });

    const reply = await runProxyKanji("河", pairById("ja-vi"));
    expect(urls).toHaveLength(3);
    const card = reply.kanji[0];
    expect(card.structure?.phonetic).toMatchObject({ literal: "可", hanViet: "KHẢ" });
    // 氵/可 đã kể ở khối lục thư nên không lặp lại ở "bộ phận".
    expect(card.components).toEqual([]);
    expect(card.family?.members).toEqual([{ literal: "何", hanViet: "HÀ", meaning: "cái gì", onyomi: "" }]);
  });

  it("lượt phụ hỏng thì thẻ vẫn còn, chỉ chữ con trơ mặt chữ", async () => {
    let call = 0;
    vi.stubGlobal("fetch", async () => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify([kanji("河", { components: ["氵", "可"] })]), { status: 200 });
      throw new TypeError("Failed to fetch");
    });
    const reply = await runProxyKanji("河", pairById("ja-vi"));
    expect(reply.error).toBeUndefined();
    expect(reply.kanji[0].components).toEqual([
      { literal: "氵", hanViet: "", meaning: "", onyomi: "" },
      { literal: "可", hanViet: "", meaning: "", onyomi: "" },
    ]);
  });

  it("không có chữ Hán → KHÔNG gọi mạng", async () => {
    const urls = okWith([]);
    const reply = await runProxyKanji("hello", pairById("ja-vi"));
    expect(urls).toHaveLength(0);
    expect(reply).toMatchObject({ chars: [], kanji: [] });
    expect(reply.error).toBeUndefined();
  });

  it("mất mạng → cờ error 'network'", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect((await runProxyKanji("勉", pairById("ja-vi"))).error).toBe("network");
  });

  it("không có route /api/kanji (deploy tĩnh, 404) cũng là lỗi nguồn", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    expect((await runProxyKanji("勉", pairById("ja-vi"))).error).toBe("network");
  });

  it("server đáp rỗng → không lỗi, chỉ là chưa có dữ liệu", async () => {
    okWith([]);
    const reply = await runProxyKanji("勉", pairById("ja-vi"));
    expect(reply.error).toBeUndefined();
    expect(reply).toMatchObject({ chars: ["勉"], kanji: [] });
  });
});
