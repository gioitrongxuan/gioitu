import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_PAIR,
  LANG_PAIRS,
  pairById,
  loadPair,
  savePair,
} from "@/shared/languages";

describe("loadPair / savePair", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });

  it("round-trips the chosen pair", () => {
    const enJa = pairById("en-ja");
    savePair(enJa);
    expect(loadPair()).toEqual(enJa);
  });

  it("persists only the id and resolves it back through pairById", () => {
    savePair(pairById("vi-ja"));
    expect(localStorage.getItem("gioitu.dictPair.v1")).toBe("vi-ja");
    expect(loadPair()).toBe(LANG_PAIRS.find((p) => p.id === "vi-ja"));
  });

  it("returns the default when nothing is stored", () => {
    expect(loadPair()).toBe(DEFAULT_PAIR);
  });

  it("falls back to the default on an unknown stored id", () => {
    localStorage.setItem("gioitu.dictPair.v1", "zz-zz");
    expect(loadPair()).toBe(DEFAULT_PAIR);
  });
});
