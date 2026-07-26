// Routing thuần (#148): URL ↔ Route hai chiều + stack "Back đóng overlay".

import { describe, expect, it, vi } from "vitest";
import { createBackStack, parsePath, Route, routeToPath } from "@/app/routes";

describe("routeToPath / parsePath", () => {
  it("mỗi trang một path riêng, round-trip được", () => {
    const pages: Route[] = [
      { kind: "page", page: "home" },
      { kind: "page", page: "learned" },
      { kind: "page", page: "kanji" },
      { kind: "page", page: "vocabstudy" },
    ];
    for (const r of pages) expect(parsePath(routeToPath(r))).toEqual(r);
    expect(routeToPath({ kind: "page", page: "home" })).toBe("/");
  });

  it("deep-link từ: mã hoá term (kể cả tiếng Nhật, ký tự đặc biệt) và round-trip", () => {
    const word: Route = { kind: "word", term_lang: "ja", native_lang: "vi", term: "食べる" };
    const path = routeToPath(word);
    expect(path).toBe(`/word/ja-vi/${encodeURIComponent("食べる")}`);
    expect(parsePath(path)).toEqual(word);

    const tricky: Route = { kind: "word", term_lang: "en", native_lang: "vi", term: "a/b?c d" };
    expect(parsePath(routeToPath(tricky))).toEqual(tricky);
  });

  it("path lạ hoặc %-escape hỏng → về trang chủ", () => {
    expect(parsePath("/khong-ton-tai")).toEqual({ kind: "page", page: "home" });
    expect(parsePath("/word/ja-vi/%E0%A4%A")).toEqual({ kind: "page", page: "home" });
    expect(parsePath("/word/khong-hop-le")).toEqual({ kind: "page", page: "home" });
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
