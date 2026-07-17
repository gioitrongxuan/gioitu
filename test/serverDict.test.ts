import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DictionaryNetworkError,
  serverFuzzy,
  serverLookup,
  serverSuggest,
} from "@/features/dictionary/data/serverDict";
import { findTermsRouted } from "@/features/dictionary/data/search";
import { pairById, pairId } from "@/shared/languages";

const jaVi = pairById(pairId("ja", "vi"));

const okEmpty = (async () => new Response("[]", { status: 200 })) as unknown as typeof fetch;
const httpError = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
const rejectFetch = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;
const notJson = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;

// Cốt lõi của BACKLOG GĐ0: KHÔNG nuốt lỗi mạng thành []. serverLookup ném khi
// không gọi được máy chủ, nhưng trả [] khi máy chủ đáp "không có từ".
describe("serverLookup: phân biệt lỗi mạng với 'không có từ'", () => {
  it("200 [] → [] (thật sự không có kết quả)", async () => {
    expect(await serverLookup("犬", "ja", "vi", okEmpty)).toEqual([]);
  });

  it("HTTP 5xx → ném DictionaryNetworkError", async () => {
    await expect(serverLookup("犬", "ja", "vi", httpError)).rejects.toBeInstanceOf(DictionaryNetworkError);
  });

  it("fetch reject (mất mạng) → ném DictionaryNetworkError", async () => {
    await expect(serverLookup("犬", "ja", "vi", rejectFetch)).rejects.toBeInstanceOf(DictionaryNetworkError);
  });

  it("phản hồi không phải JSON (backend vắng mặt) → ném DictionaryNetworkError", async () => {
    await expect(serverLookup("犬", "ja", "vi", notJson)).rejects.toBeInstanceOf(DictionaryNetworkError);
  });
});

// Gợi ý-khi-gõ và near-miss là phụ trợ: lỗi mạng thì im lặng, không quấy người dùng.
describe("serverSuggest / serverFuzzy: nuốt lỗi mạng thành []", () => {
  it("lỗi mạng → [] (không ném)", async () => {
    expect(await serverSuggest("いぬ", "ja", "vi", rejectFetch)).toEqual([]);
    expect(await serverFuzzy("いぬ", "ja", "vi", httpError)).toEqual([]);
  });
});

// Cờ lỗi phải tới tận facade để UI dựa vào đó mà báo đúng thay vì "không tìm thấy".
describe("findTermsRouted (nguồn server): cờ lỗi tới facade", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mất mạng → error 'network', results rỗng", async () => {
    vi.stubGlobal("fetch", rejectFetch);
    expect(await findTermsRouted("する", jaVi, "server")).toEqual({ results: [], error: "network" });
  });

  it("máy chủ đáp rỗng → error null, results rỗng (không tìm thấy thật)", async () => {
    vi.stubGlobal("fetch", okEmpty);
    const r = await findTermsRouted("する", jaVi, "server");
    expect(r.error).toBeNull();
    expect(r.results).toEqual([]);
  });
});
