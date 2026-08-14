import { describe, it, expect } from "vitest";
import {
  YOMITAN_STORES,
  orderedYomitanStores,
  recommendedYomitanStore,
} from "@/features/auth/domain/yomitanStores";

// UA thật (đã cắt bớt phần không liên quan) để nhánh nhận dạng không bị test
// bằng chuỗi tự bịa.
const UA = {
  chrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  edge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  safari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
};

describe("recommendedYomitanStore", () => {
  it("Chrome trên desktop → Chrome Web Store", () => {
    expect(recommendedYomitanStore(UA.chrome)?.id).toBe("chrome");
  });

  it("Edge → store của Edge, không rơi vào nhánh Chrome dù UA có 'chrome'", () => {
    expect(recommendedYomitanStore(UA.edge)?.id).toBe("edge");
  });

  it("Firefox → addons.mozilla.org", () => {
    expect(recommendedYomitanStore(UA.firefox)?.id).toBe("firefox");
  });

  it("Safari: Yomitan chưa có bản nào nên không gợi ý gì", () => {
    expect(recommendedYomitanStore(UA.safari)).toBeNull();
  });

  it("Chrome trên iOS không cài được tiện ích → không gợi ý", () => {
    expect(recommendedYomitanStore(UA.chromeIos)).toBeNull();
  });

  it("UA rỗng hoặc lạ → không gợi ý", () => {
    expect(recommendedYomitanStore("")).toBeNull();
    expect(recommendedYomitanStore("curl/8.6.0")).toBeNull();
  });
});

describe("orderedYomitanStores", () => {
  it("đưa store khớp trình duyệt lên đầu, vẫn giữ đủ các store còn lại", () => {
    const ordered = orderedYomitanStores(UA.firefox);
    expect(ordered.map((s) => s.id)).toEqual(["firefox", "chrome", "edge"]);
  });

  it("không đoán được thì giữ thứ tự mặc định", () => {
    expect(orderedYomitanStores(UA.safari).map((s) => s.id)).toEqual(
      YOMITAN_STORES.map((s) => s.id),
    );
  });

  it("không làm hỏng danh sách gốc khi sắp lại", () => {
    orderedYomitanStores(UA.edge);
    expect(YOMITAN_STORES.map((s) => s.id)).toEqual(["chrome", "edge", "firefox"]);
  });

  it("mọi link đều là https tới store chính thức", () => {
    for (const store of YOMITAN_STORES) {
      expect(store.url).toMatch(
        /^https:\/\/(chromewebstore\.google\.com|microsoftedge\.microsoft\.com|addons\.mozilla\.org)\//,
      );
    }
  });
});
