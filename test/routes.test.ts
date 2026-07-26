// Routing thuần (#148, IA 4 khu #149): URL ↔ Route hai chiều + stack "Back đóng overlay".

import { describe, expect, it, vi } from "vitest";
import { createBackStack, khuOf, Page, parsePath, Route, routeToPath } from "@/app/routes";

describe("routeToPath / parsePath", () => {
  it("mỗi trang một path riêng, round-trip được", () => {
    const pages: Page[] = ["today", "search", "cloud", "learned", "kanji", "vocabstudy", "me"];
    for (const page of pages) {
      const r: Route = { kind: "page", page };
      expect(parsePath(routeToPath(r))).toEqual(r);
    }
    // Trang chủ là Bản đồ từ (map-first): mở app thấy ngay bản đồ + tra được liền.
    expect(routeToPath({ kind: "page", page: "cloud" })).toBe("/");
    expect(routeToPath({ kind: "page", page: "today" })).toBe("/today");
  });

  it("path thời chưa có 4 khu vẫn mở đúng trang mới", () => {
    expect(parsePath("/learned")).toEqual({ kind: "page", page: "learned" });
    expect(parsePath("/kanji")).toEqual({ kind: "page", page: "kanji" });
    expect(parsePath("/vocabstudy")).toEqual({ kind: "page", page: "vocabstudy" });
    expect(parsePath("/words")).toEqual({ kind: "page", page: "cloud" });
  });

  it("khuOf gom các trang con về khu Kho từ", () => {
    expect(khuOf("today")).toBe("today");
    expect(khuOf("search")).toBe("search");
    expect(khuOf("me")).toBe("me");
    for (const page of ["cloud", "learned", "kanji", "vocabstudy"] as const) {
      expect(khuOf(page)).toBe("words");
    }
  });

  it("deep-link từ: mã hoá term (kể cả tiếng Nhật, ký tự đặc biệt) và round-trip", () => {
    const word: Route = { kind: "word", term_lang: "ja", native_lang: "vi", term: "食べる" };
    const path = routeToPath(word);
    expect(path).toBe(`/word/ja-vi/${encodeURIComponent("食べる")}`);
    expect(parsePath(path)).toEqual(word);

    const tricky: Route = { kind: "word", term_lang: "en", native_lang: "vi", term: "a/b?c d" };
    expect(parsePath(routeToPath(tricky))).toEqual(tricky);
  });

  it("path lạ hoặc %-escape hỏng → về trang chủ (bản đồ từ)", () => {
    expect(parsePath("/khong-ton-tai")).toEqual({ kind: "page", page: "cloud" });
    expect(parsePath("/word/ja-vi/%E0%A4%A")).toEqual({ kind: "page", page: "cloud" });
    expect(parsePath("/word/khong-hop-le")).toEqual({ kind: "page", page: "cloud" });
  });
});

describe("createBackStack", () => {
  it("Back đóng overlay trên cùng trước (LIFO)", () => {
    const stack = createBackStack(() => {});
    const closed: string[] = [];
    stack.push(() => closed.push("dưới"));
    stack.push(() => closed.push("trên"));

    expect(stack.handlePop()).toBe(true);
    expect(closed).toEqual(["trên"]);
    expect(stack.handlePop()).toBe(true);
    expect(closed).toEqual(["trên", "dưới"]);
    // Hết overlay: popstate là điều hướng trang thật, caller tự xử lý.
    expect(stack.handlePop()).toBe(false);
  });

  it("đóng bằng UI rút lại entry: goBack một nhịp và popstate đó bị nuốt", () => {
    const goBack = vi.fn();
    const stack = createBackStack(goBack);
    const entry = stack.push(() => {});

    stack.remove(entry);
    expect(goBack).toHaveBeenCalledTimes(1);
    // popstate do chính goBack gây ra: đã xử lý (true) nhưng không đóng gì thêm.
    expect(stack.handlePop()).toBe(true);
    expect(stack.handlePop()).toBe(false);
  });

  it("đóng qua Back rồi thì remove (cleanup React) không goBack lần nữa", () => {
    const goBack = vi.fn();
    const stack = createBackStack(goBack);
    let open = true;
    const entry = stack.push(() => {
      open = false;
    });

    expect(stack.handlePop()).toBe(true); // Back đóng overlay
    expect(open).toBe(false);
    stack.remove(entry); // effect cleanup chạy sau khi state đổi — phải là no-op
    expect(goBack).not.toHaveBeenCalled();
  });

  it("remove entry giữa stack (không phải trên cùng) thì không goBack — entry kẹt vô hại", () => {
    const goBack = vi.fn();
    const stack = createBackStack(goBack);
    const under = stack.push(() => {});
    stack.push(() => {});

    stack.remove(under);
    expect(goBack).not.toHaveBeenCalled();
    expect(stack.depth()).toBe(1);
  });
});
