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
  semantic?: Part;
  phonetic?: Part;
}
interface Family {
  kind: "phonetic" | "semantic";
  label: string;
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
  families: Family[];
}

type Map_ = Map<string, unknown>;
const { MAX_FAMILY, MAX_KANJI } = cards as { MAX_FAMILY: number; MAX_KANJI: number };
const hanCharsOf = cards.hanCharsOf as (text: string, limit?: number) => string[];
const describeStructure = cards.describeStructure as (sc: unknown, map?: Map_) => Structure | null;
const toPart = cards.toPart as (literal: string, map: Map_) => Part;
const toCard = cards.toCard as (entry: unknown, map?: Map_) => Card;
const extraComponents = cards.extraComponents as (entry: unknown) => string[];
const familiesOf = cards.familiesOf as (
  entry: unknown,
  map: Map_,
) => { kind: string; head: string; label: string; members: string[] }[];
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
  keiseiSemantic?: string[];
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

  it("các lối còn lại chỉ có nhãn — không kèm câu giảng giải nào", () => {
    const view = describeStructure({ type: "shoukei" })!;
    expect(view).toEqual({ type: "shoukei", label: "Tượng hình (象形)" });
  });

  it("không có dữ liệu cấu tạo → null, KHÁC với 'unknown' (nguồn nói không rõ)", () => {
    expect(describeStructure(undefined)).toBeNull();
    expect(describeStructure({ type: "unknown" })!.type).toBe("unknown");
  });

  it.each(["shoukei", "shiji", "kaii", "kokuji", "shinjitai", "derivative", "rebus", "unknown"])(
    "lối %s có nhãn tiếng Việt",
    (type) => {
      expect(describeStructure({ type })!.label).toBeTruthy();
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

// Họ chữ là thứ trả công cho việc học chiết tự, theo hai chiều: cùng phần âm
// (可 → 何 荷 歌, đều đọc カ) và cùng bộ (水 → 河 海 池, đều chuyện nước nôi).
describe("familiesOf", () => {
  const phoneticHead = kanji("可", { keiseiPhonetic: ["何", "河", "荷"] });
  const semanticHead = kanji("水", { keiseiSemantic: ["河", "海", "池"] });
  const keisei = kanji("河", { structuralCategory: { type: "keisei", semantic: "水", phonetic: "可" } });

  it("chữ hình thanh → anh em cùng phần âm VÀ anh em cùng bộ (bỏ chính nó)", () => {
    expect(familiesOf(keisei, byLiteral([phoneticHead, semanticHead]))).toEqual([
      { kind: "phonetic", head: "可", label: "Chữ cùng phần âm 可", members: ["何", "荷"] },
      { kind: "semantic", head: "水", label: "Chữ cùng bộ 水", members: ["海", "池"] },
    ]);
  });

  it("chữ tự làm phần âm / làm bộ → những chữ dựng trên nó, câu dẫn đổi chiều", () => {
    expect(familiesOf(phoneticHead, new Map())).toEqual([
      { kind: "phonetic", head: "可", label: "Những chữ dùng 可 làm phần âm", members: ["何", "河", "荷"] },
    ]);
    expect(familiesOf(semanticHead, new Map())).toEqual([
      { kind: "semantic", head: "水", label: "Những chữ dùng 水 làm bộ", members: ["河", "海", "池"] },
    ]);
  });

  it("một chữ vừa làm phần âm vừa làm bộ cho chữ khác → cả hai họ", () => {
    const both = kanji("青", { keiseiPhonetic: ["清", "晴"], keiseiSemantic: ["静"] });
    expect(familiesOf(both, new Map()).map((f) => f.kind)).toEqual(["phonetic", "semantic"]);
  });

  it("chưa tra được chữ đứng đầu họ → không bịa ra họ nào", () => {
    expect(familiesOf(keisei, new Map())).toEqual([]);
  });

  it("chữ không dính gì tới hình thanh → không có họ", () => {
    expect(familiesOf(kanji("山", { structuralCategory: { type: "shoukei" } }), new Map())).toEqual([]);
  });
});

describe("thẻ có họ chữ", () => {
  it("chú thích từng chữ trong họ, và giữ nguyên chiều của câu dẫn", () => {
    const map = byLiteral([
      kanji("可", { hanViet: ["KHẢ"], keiseiPhonetic: ["何", "河"] }),
      kanji("何", { hanViet: ["HÀ"], meanings: ["cái gì"], onyomi: [{ text: "カ" }] }),
    ]);
    const card = toCard(
      kanji("河", { structuralCategory: { type: "keisei", semantic: "水", phonetic: "可" } }),
      map,
    );
    expect(card.families).toHaveLength(1);
    expect(card.families[0].label).toBe("Chữ cùng phần âm 可");
    expect(card.families[0].members[0]).toEqual({
      literal: "何",
      hanViet: "HÀ",
      meaning: "cái gì",
      onyomi: "カ",
    });
  });

  it("họ theo bộ mang nhãn 'semantic' để thẻ tô đúng màu phần nghĩa", () => {
    const head = kanji("水", { keiseiSemantic: ["河", "海"] });
    expect(toCard(head, byLiteral([head])).families[0].kind).toBe("semantic");
  });

  it("chữ hay gặp đứng trước, và cắt ở MAX_FAMILY", () => {
    const members = Array.from({ length: MAX_FAMILY + 5 }, (_, i) => String.fromCodePoint(0x4e00 + i));
    const head = kanji("可", { keiseiPhonetic: members });
    // Chữ cuối danh sách nhưng phổ biến nhất → phải nhảy lên đầu.
    const map = byLiteral([head, kanji(members[members.length - 1], { score: 99 })]);
    const family = toCard(head, map).families[0];
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

  it("lượt 3 = thành viên CẢ HAI họ, trừ chữ đã có, cắt ở trần", () => {
    const map = byLiteral([
      entry,
      kanji("可", { keiseiPhonetic: ["何", "河", "荷"] }),
      kanji("氵", { keiseiSemantic: ["河", "海"] }),
    ]);
    // 河 đã tra ở lượt 1 nên không hỏi lại; 何/荷 (cùng phần âm) và 海 (cùng bộ)
    // thì cần để có Hán-Việt + âm On.
    expect(familyCharsOf([entry], map)).toEqual(["何", "荷", "海"]);
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
