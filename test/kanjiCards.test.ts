// Logic dựng thẻ chiết tự của extension (extension-chiettu/kanji-cards.js).
// Extension không có bước build nên module viết bằng JS thuần, nhưng nó vẫn là
// logic thuần → test ở đây như mọi domain khác.
import { describe, expect, it } from "vitest";
import * as cards from "../extension-chiettu/kanji-cards.js";

// Module là JS thuần (extension không có bước build) nên TS chỉ suy ra được kiểu
// lỏng lẻo. Khai hình dạng ở đây một lần để phần test bên dưới đọc như code có
// kiểu — đây cũng chính là hợp đồng mà card.js dựa vào để vẽ.
interface Part {
  literal: string;
  hanViet: string;
  meaning: string;
  onyomi: string;
}
interface Structure {
  type: string;
  label: string;
  hint: string;
  semantic?: Part;
  phonetic?: Part;
}
interface Family {
  phonetic: Part;
  label: string;
  hint: string;
  members: Part[];
}
interface Card {
  literal: string;
  hanViet: string;
  meanings: string;
  onyomi: string;
  kunyomi: string;
  strokeCount: number;
  components: Part[];
  structure: Structure | null;
  family: Family | null;
}

type Map_ = Map<string, unknown>;
const { MAX_FAMILY, MAX_KANJI } = cards as { MAX_FAMILY: number; MAX_KANJI: number };
const hanCharsOf = cards.hanCharsOf as (text: string, limit?: number) => string[];
const describeStructure = cards.describeStructure as (sc: unknown, map?: Map_) => Structure | null;
const toPart = cards.toPart as (literal: string, map: Map_) => Part;
const toCard = cards.toCard as (entry: unknown, map?: Map_) => Card;
const extraComponents = cards.extraComponents as (entry: unknown) => string[];
const familyOf = cards.familyOf as (entry: unknown, map: Map_) => { phonetic: string; members: string[] } | null;
const partCharsOf = cards.partCharsOf as (entries: unknown[]) => string[];
const familyCharsOf = cards.familyCharsOf as (entries: unknown[], map: Map_, limit?: number) => string[];
const buildCards = cards.buildCards as (chars: string[], entries: unknown) => Card[];

interface Entry {
  literal: string;
  strokeCount?: number;
  components?: string[];
  meanings?: string[];
  hanViet?: string[];
  onyomi?: { text: string }[];
  kunyomi?: { text: string }[];
  structuralCategory?: { type: string; semantic?: string; phonetic?: string };
  keiseiPhonetic?: string[];
  score?: number;
}

const kanji = (literal: string, over: Partial<Entry> = {}): Entry => ({
  literal,
  strokeCount: 1,
  components: [],
  meanings: [],
  kunyomi: [],
  onyomi: [],
  ...over,
});

const byLiteral = (entries: Entry[]) => new Map(entries.map((e) => [e.literal, e]));

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
    expect(hanCharsOf("一二三四五六七八九十")).toHaveLength(MAX_KANJI);
    expect(hanCharsOf("一二三四五", 3)).toEqual(["一", "二", "三"]);
  });
});

describe("describeStructure", () => {
  it("chữ hình thanh kèm phần nghĩa và phần âm, mỗi phần có nghĩa + Hán-Việt của chính nó", () => {
    const parts = byLiteral([
      kanji("可", { hanViet: ["KHẢ"], meanings: ["có thể", "khá"], onyomi: [{ text: "カ" }] }),
    ]);
    const view = describeStructure({ type: "keisei", semantic: "氵", phonetic: "可" }, parts)!;
    expect(view.label).toContain("Hình thanh");
    expect(view.phonetic).toEqual({ literal: "可", hanViet: "KHẢ", meaning: "có thể", onyomi: "カ" });
    // Bộ thủ thường không có dòng riêng trong bảng kanji → chỉ còn mặt chữ.
    expect(view.semantic).toEqual({ literal: "氵", hanViet: "", meaning: "", onyomi: "" });
  });

  it("các lối còn lại chỉ có nhãn + một câu giải thích", () => {
    const view = describeStructure({ type: "shoukei" })!;
    expect(view.label).toContain("Tượng hình");
    expect(view.hint).not.toHaveLength(0);
    expect(view.semantic).toBeUndefined();
  });

  it("không có dữ liệu cấu tạo → null, KHÁC với 'unknown' (nguồn nói không rõ)", () => {
    expect(describeStructure(undefined)).toBeNull();
    expect(describeStructure({ type: "unknown" })!.type).toBe("unknown");
  });

  it.each(["shoukei", "shiji", "kaii", "kokuji", "shinjitai", "derivative", "rebus", "unknown"])(
    "lối %s có nhãn tiếng Việt",
    (type) => {
      const view = describeStructure({ type })!;
      expect(view.label).toBeTruthy();
      expect(view.hint).toBeTruthy();
    },
  );
});

describe("toPart", () => {
  it("chữ bảng kanji không có → chỉ còn mặt chữ, các trường khác rỗng", () => {
    expect(toPart("氵", new Map())).toEqual({ literal: "氵", hanViet: "", meaning: "", onyomi: "" });
  });
});

describe("toCard", () => {
  it("gộp các trường của chính chữ ấy thành chuỗi sẵn để chỉ việc hiện", () => {
    const card = toCard(
      kanji("河", {
        strokeCount: 8,
        hanViet: ["HÀ"],
        meanings: ["sông", "hà"],
        onyomi: [{ text: "カ" }],
        kunyomi: [{ text: "かわ" }],
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
  });

  it("chữ con mang theo nghĩa + Hán-Việt của chính nó", () => {
    const parts = byLiteral([kanji("可", { hanViet: ["KHẢ"], meanings: ["có thể"] })]);
    const card = toCard(kanji("河", { components: ["氵", "可"] }), parts);
    expect(card.components[1]).toMatchObject({ literal: "可", hanViet: "KHẢ", meaning: "có thể" });
  });
});

describe("extraComponents", () => {
  it("bỏ chính chữ đang xét (nguồn kể cả nó)", () => {
    expect(extraComponents(kanji("河", { components: ["河", "氵", "可"] }))).toEqual(["氵", "可"]);
  });

  it("chữ hình thanh: không nhắc lại phần nghĩa/phần âm đã kể ở khối lục thư", () => {
    const entry = kanji("河", {
      components: ["氵", "可", "口"],
      structuralCategory: { type: "keisei", semantic: "氵", phonetic: "可" },
    });
    // 口 là thành phần của chính phần âm 可 — cái đó chưa nói ở đâu nên giữ lại.
    expect(extraComponents(entry)).toEqual(["口"]);
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

  it("chưa tra được chữ làm phần âm → không bịa ra họ", () => {
    const entry = kanji("河", { structuralCategory: { type: "keisei", semantic: "氵", phonetic: "可" } });
    expect(familyOf(entry, new Map())).toBeNull();
  });

  it("chữ không dính gì tới hình thanh → không có họ", () => {
    expect(familyOf(kanji("山", { structuralCategory: { type: "shoukei" } }), new Map())).toBeNull();
  });
});

describe("thẻ có họ chữ", () => {
  it("nêu phần âm, câu dẫn theo chiều tra, và chú thích từng chữ trong họ", () => {
    const map = byLiteral([
      kanji("可", { hanViet: ["KHẢ"], keiseiPhonetic: ["何", "河"] }),
      kanji("何", { hanViet: ["HÀ"], meanings: ["cái gì"], onyomi: [{ text: "カ" }] }),
    ]);
    const card = toCard(
      kanji("河", { structuralCategory: { type: "keisei", semantic: "氵", phonetic: "可" } }),
      map,
    );
    expect(card.family!.label).toBe("Chữ cùng phần âm 可");
    expect(card.family!.phonetic).toMatchObject({ literal: "可", hanViet: "KHẢ" });
    expect(card.family!.members[0]).toEqual({ literal: "何", hanViet: "HÀ", meaning: "cái gì", onyomi: "カ" });
  });

  it("tra chính chữ làm phần âm → câu dẫn đổi chiều", () => {
    const head = kanji("可", { keiseiPhonetic: ["何", "河"] });
    expect(toCard(head, byLiteral([head])).family!.label).toBe("Những chữ dùng 可 làm phần âm");
  });

  it("chữ hay gặp đứng trước, và cắt ở MAX_FAMILY", () => {
    const members = Array.from({ length: MAX_FAMILY + 5 }, (_, i) => String.fromCodePoint(0x4e00 + i));
    const head = kanji("可", { keiseiPhonetic: members });
    // Chữ cuối danh sách nhưng phổ biến nhất → phải nhảy lên đầu.
    const map = byLiteral([head, kanji(members[members.length - 1], { score: 99 })]);
    const family = toCard(head, map).family!;
    expect(family.members).toHaveLength(MAX_FAMILY);
    expect(family.members[0].literal).toBe(members[members.length - 1]);
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

describe("buildCards", () => {
  it("sắp thẻ theo thứ tự chữ trên trang, không theo thứ tự hàng trả về", () => {
    const cards = buildCards(["勉", "強"], [kanji("強"), kanji("勉")]);
    expect(cards.map((c) => c.literal)).toEqual(["勉", "強"]);
  });

  it("chữ bảng kanji không có thì vắng thẻ (kể cả khi cache nhớ là 'không có')", () => {
    const map: Map_ = new Map([["勉", kanji("勉")], ["々", null]]);
    expect(buildCards(["勉", "々"], map).map((c) => c.literal)).toEqual(["勉"]);
  });
});
