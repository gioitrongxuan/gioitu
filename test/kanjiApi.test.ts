// Lớp gọi `/api/kanji` + cache của extension (extension-chiettu/kanji-api.js).
// Cache là chỗ đổi lấy tốc độ cho chế độ rê chuột, nên nó phải: không hỏi lại
// chữ đã biết, nhớ cả "bảng không có chữ này", và không nuốt lỗi mạng thành
// "chưa có dữ liệu".
import { describe, expect, it, vi } from "vitest";
import * as api from "../extension-chiettu/kanji-api.js";

// Module là JS thuần (extension không có bước build) → khai hình dạng ở đây một
// lần, phần test bên dưới đọc như code có kiểu.
interface Part {
  literal: string;
  hanViet: string;
  meaning: string;
  onyomi: string;
}
interface Card {
  literal: string;
  structure: { phonetic?: Part } | null;
  family: { members: Part[] } | null;
}
interface Pair {
  src: string;
  tgt: string;
}
interface Persist {
  load: () => Promise<Record<string, Record<string, unknown>>>;
  save: (data: Record<string, unknown>) => Promise<void>;
}
interface KanjiApi {
  cards: (
    base: string,
    pair: Pair,
    chars: string[],
    onQuick?: (cards: Card[]) => void,
  ) => Promise<{ cards: Card[]; error: string | null }>;
  cached: (base: string, pair: Pair, chars: string[]) => Promise<boolean>;
  clear: () => void;
}
const createKanjiApi = api.createKanjiApi as (opts?: {
  fetchFn?: (url: string | URL | Request) => Promise<Response>;
  persist?: Persist;
}) => KanjiApi;

const PAIR = { src: "ja", tgt: "vi" };
const BASE = "https://gioitu.example";

interface Entry {
  literal: string;
  components?: string[];
  structuralCategory?: { type: string; semantic?: string; phonetic?: string };
  keiseiPhonetic?: string[];
  hanViet?: string[];
}

/** fetch giả: trả các hàng khớp `chars` trong URL, và ghi lại từng lượt hỏi. */
function fakeFetch(rows: Entry[], onCall?: (chars: string) => void) {
  const calls: string[] = [];
  const fetchFn = async (url: string | URL | Request) => {
    const chars = decodeURIComponent(new URL(String(url)).searchParams.get("chars") ?? "");
    calls.push(chars);
    onCall?.(chars);
    return new Response(JSON.stringify(rows.filter((r) => chars.includes(r.literal))), { status: 200 });
  };
  return { fetchFn, calls };
}

const ROWS: Entry[] = [
  {
    literal: "河",
    hanViet: ["HÀ"],
    components: ["氵", "可"],
    structuralCategory: { type: "keisei", semantic: "氵", phonetic: "可" },
  },
  { literal: "可", hanViet: ["KHẢ"], keiseiPhonetic: ["何", "河", "荷"] },
  { literal: "何", hanViet: ["HÀ"] },
  { literal: "荷", hanViet: ["HÀ"] },
];

describe("createKanjiApi.cards", () => {
  it("ba lượt: chữ được hỏi → chữ con → họ chữ, và báo 'quick' ngay sau lượt đầu", async () => {
    const { fetchFn, calls } = fakeFetch(ROWS);
    const api = createKanjiApi({ fetchFn });
    const quick: Card[][] = [];
    const { cards, error } = await api.cards(BASE, PAIR, ["河"], (c) => quick.push(c));

    expect(error).toBeNull();
    expect(calls).toEqual(["河", "氵可", "何荷"]);
    // Thẻ "quick" hiện ra trước khi chữ con kịp về — đó là điểm mấu chốt về tốc độ.
    expect(quick).toHaveLength(1);
    expect(quick[0]).toHaveLength(1);
    expect(cards[0].structure!.phonetic).toMatchObject({ literal: "可", hanViet: "KHẢ" });
    expect(cards[0].family!.members.map((m) => m.literal)).toEqual(["何", "荷"]);
  });

  it("chữ đã tra → KHÔNG hỏi lại lần nào nữa (rê chuột qua lại phải tức thì)", async () => {
    const { fetchFn, calls } = fakeFetch(ROWS);
    const api = createKanjiApi({ fetchFn });
    await api.cards(BASE, PAIR, ["河"]);
    const before = calls.length;
    const { cards } = await api.cards(BASE, PAIR, ["河"]);
    expect(calls).toHaveLength(before);
    expect(cards[0].literal).toBe("河");
    expect(await api.cached(BASE, PAIR, ["河"])).toBe(true);
  });

  it("chỉ hỏi phần còn thiếu khi tra chữ mới", async () => {
    const { fetchFn, calls } = fakeFetch([...ROWS, { literal: "湖" }]);
    const api = createKanjiApi({ fetchFn });
    await api.cards(BASE, PAIR, ["河"]);
    calls.length = 0;
    await api.cards(BASE, PAIR, ["河", "湖"]);
    expect(calls[0]).toBe("湖");
  });

  it("bảng không có chữ → nhớ luôn là 'không có', không hỏi lại", async () => {
    const { fetchFn, calls } = fakeFetch([]);
    const api = createKanjiApi({ fetchFn });
    expect((await api.cards(BASE, PAIR, ["々"])).cards).toEqual([]);
    await api.cards(BASE, PAIR, ["々"]);
    expect(calls).toEqual(["々"]);
  });

  it("mất mạng ở lượt đầu → cờ lỗi, không thẻ nào (không báo nhầm 'chưa có dữ liệu')", async () => {
    const api = createKanjiApi({
      fetchFn: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(await api.cards(BASE, PAIR, ["河"])).toEqual({ cards: [], error: "network" });
  });

  it("404 (deploy tĩnh, không có route /api) cũng là lỗi nguồn", async () => {
    const api = createKanjiApi({ fetchFn: async () => new Response("", { status: 404 }) });
    expect((await api.cards(BASE, PAIR, ["河"])).error).toBe("network");
  });

  it("lượt phụ hỏng thì thẻ vẫn còn, chỉ chữ con trơ mặt chữ", async () => {
    let call = 0;
    const api = createKanjiApi({
      fetchFn: async () => {
        call += 1;
        if (call === 1) return new Response(JSON.stringify([ROWS[0]]), { status: 200 });
        throw new TypeError("Failed to fetch");
      },
    });
    const { cards, error } = await api.cards(BASE, PAIR, ["河"]);
    expect(error).toBeNull();
    expect(cards[0].structure!.phonetic).toEqual({ literal: "可", hanViet: "", meaning: "", onyomi: "" });
  });

  it("lỗi mạng KHÔNG bị nhớ thành 'không có chữ' — lần sau hỏi lại", async () => {
    let fail = true;
    const calls: string[] = [];
    const api = createKanjiApi({
      fetchFn: async (url: string | URL | Request) => {
        calls.push(decodeURIComponent(new URL(String(url)).searchParams.get("chars") ?? ""));
        if (fail) throw new TypeError("Failed to fetch");
        return new Response(JSON.stringify([ROWS[0]]), { status: 200 });
      },
    });
    expect((await api.cards(BASE, PAIR, ["河"])).error).toBe("network");
    fail = false;
    expect((await api.cards(BASE, PAIR, ["河"])).cards).toHaveLength(1);
    expect(calls.filter((c) => c === "河")).toHaveLength(2);
  });
});

describe("cache xuống đĩa", () => {
  it("service worker ngủ dậy: nạp lại cache cũ thì không hỏi mạng nữa", async () => {
    const { fetchFn, calls } = fakeFetch(ROWS);
    const api = createKanjiApi({
      fetchFn,
      persist: { load: async () => ({ "ja-vi": { 河: ROWS[0], 氵: null, 可: ROWS[1] } }), save: async () => {} },
    });
    const { cards } = await api.cards(BASE, PAIR, ["河"]);
    expect(cards[0].structure!.phonetic).toMatchObject({ literal: "可", hanViet: "KHẢ" });
    // Chỉ còn thiếu họ chữ (何, 荷) — chữ chính và chữ con đã nằm sẵn trên đĩa.
    expect(calls).toEqual(["何荷"]);
  });

  it("ghi xuống đĩa gộp lại, không ghi mỗi lượt tra", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_data: Record<string, unknown>) => {});
    const { fetchFn } = fakeFetch(ROWS);
    const api = createKanjiApi({ fetchFn, persist: { load: async () => ({}), save } });
    await api.cards(BASE, PAIR, ["河"]);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(Object.keys(save.mock.calls[0][0])).toEqual(["ja-vi"]);
    vi.useRealTimers();
  });

  it("clear() bỏ hết — đổi địa chỉ Gioitu là đổi máy chủ", async () => {
    const { fetchFn, calls } = fakeFetch(ROWS);
    const api = createKanjiApi({ fetchFn });
    await api.cards(BASE, PAIR, ["河"]);
    api.clear();
    calls.length = 0;
    await api.cards(BASE, PAIR, ["河"]);
    expect(calls[0]).toBe("河");
  });
});
