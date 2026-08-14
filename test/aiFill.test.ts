import { describe, it, expect, vi, afterEach } from "vitest";
import { aiFillDraft } from "@/features/dictionary/data/aiGenerate";
import { pairById } from "@/shared/languages";

// Nút "✨ AI điền hộ" ở Thêm nhanh có ô dặn thêm (#274): lời dặn phải thật sự đi
// vào prompt gửi model, nếu không ô chỉ là trang trí.
vi.mock("@/features/auth/data/auth", () => ({ authToken: () => "token-giả" }));

const JA_VI = pairById("ja-vi");

/** Bắt prompt gửi lên /api/ai/generate-vocab, trả về một từ hợp lệ. */
function captureFetch(): { prompt: string } {
  const seen = { prompt: "" };
  const content = JSON.stringify({ words: [{ term: "勉強", meanings: ["học tập"] }] });
  vi.stubGlobal("fetch", (async (_url: string, init: RequestInit) => {
    seen.prompt = JSON.parse(String(init.body)).prompt;
    return new Response(JSON.stringify({ content }), { status: 200 });
  }) as unknown as typeof fetch);
  return seen;
}

afterEach(() => vi.unstubAllGlobals());

describe("aiFillDraft", () => {
  it("đưa lời dặn thêm của người dùng vào prompt", async () => {
    const seen = captureFetch();
    const filled = await aiFillDraft("勉強", JA_VI, "nghĩa trong ngành y");
    expect(seen.prompt).toContain("Yêu cầu thêm: nghĩa trong ngành y");
    expect(filled.gloss).toBe("học tập");
  });

  it("không dặn gì thì prompt không có dòng yêu cầu thêm", async () => {
    const seen = captureFetch();
    await aiFillDraft("勉強", JA_VI);
    expect(seen.prompt).not.toContain("Yêu cầu thêm:");
  });
});
