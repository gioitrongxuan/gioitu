// Link cài tiện ích Yomitan cho từng trình duyệt. Người dùng mở hộp thoại "Kết
// nối Yomitan" thường còn chưa có Yomitan, và tự đi tìm đúng store là bước hay
// làm họ bỏ giữa đường (#248) — nên hộp thoại đưa sẵn link. Chọn store nào để
// gợi ý là logic thuần, tách ra đây để test được không cần DOM.

export type YomitanStoreId = "chrome" | "edge" | "firefox";

export interface YomitanStore {
  id: YomitanStoreId;
  /** Nhãn = tên trình duyệt, vì người dùng nhận ra trình duyệt chứ không nhận ra tên store. */
  label: string;
  url: string;
}

// URL lấy từ README chính thức của Yomitan (yomidevs/yomitan) — cùng id tiện
// ích, chỉ dùng dạng địa chỉ hiện hành của Chrome Web Store để đỡ một lần
// redirect. Bản Firefox không ghim locale để store tự chọn theo người dùng.
const CHROME: YomitanStore = {
  id: "chrome",
  label: "Chrome",
  url: "https://chromewebstore.google.com/detail/yomitan/likgccmbimhjbgkjambclfkhldnlhbnn",
};
const EDGE: YomitanStore = {
  id: "edge",
  label: "Edge",
  url: "https://microsoftedge.microsoft.com/addons/detail/yomitan/idelnfbbmikgfiejhgmddlbkfgiifnnn",
};
const FIREFOX: YomitanStore = {
  id: "firefox",
  label: "Firefox",
  url: "https://addons.mozilla.org/firefox/addon/yomitan/",
};

/** Mọi store Yomitan có bản chính thức, thứ tự mặc định khi không đoán được trình duyệt. */
export const YOMITAN_STORES: readonly YomitanStore[] = [CHROME, EDGE, FIREFOX];

/**
 * Store khớp `userAgent`, hoặc `null` khi không đoán được — Safari và iOS chưa
 * có bản Yomitan nào, thà hiện cả ba link còn hơn gợi ý một link cài không nổi.
 */
export function recommendedYomitanStore(userAgent: string): YomitanStore | null {
  const ua = userAgent.toLowerCase();
  // Trên iOS mọi trình duyệt đều là WebKit (Chrome = "crios", Firefox =
  // "fxios") và không cài được tiện ích kiểu này, nên chặn trước hai nhánh dưới.
  if (/iphone|ipad|ipod|crios|fxios/.test(ua)) return null;
  if (ua.includes("firefox")) return FIREFOX;
  // Edge cũng mang "chrome" trong UA nên phải xét "edg/" trước.
  if (ua.includes("edg/")) return EDGE;
  if (ua.includes("chrome") || ua.includes("chromium")) return CHROME;
  return null;
}

/** `YOMITAN_STORES` với store khớp trình duyệt hiện tại xếp lên đầu. */
export function orderedYomitanStores(userAgent: string): YomitanStore[] {
  const recommended = recommendedYomitanStore(userAgent);
  if (!recommended) return [...YOMITAN_STORES];
  return [recommended, ...YOMITAN_STORES.filter((s) => s.id !== recommended.id)];
}
