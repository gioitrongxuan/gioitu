// Service worker (MV3, kiểu module) — nơi DUY NHẤT gọi mạng và giữ cache.
//
// Khác extension "Thêm nhanh từ" (nhờ app tra hộ qua cửa sổ tí hon `?lookup=`):
// ở đây gọi THẲNG `/api/kanji` — route công khai chỉ-đọc, không cần đăng nhập,
// không đụng IndexedDB của app. Đó là điều kiện để có kiểu Yomitan: rê chuột
// vào chữ là thẻ hiện ra, không thể mở một cửa sổ app cho mỗi lần rê chuột.
// Đổi lại, extension cần QUYỀN TRUY CẬP địa chỉ Gioitu (xin ở trang Tuỳ chọn,
// không nằm sẵn trong manifest) — và quyền đọc trang nếu bật chế độ rê chuột.

import { createKanjiApi } from "./kanji-api.js";
import { hanCharsOf } from "./kanji-cards.js";

// Đổi thành domain thật khi phát hành cho người dùng; để localhost cho lúc dev.
const DEFAULT_BASE_URL = "http://localhost:5173";

// Bảng kanji chỉ có dòng tiếng Nhật; nghĩa lấy tiếng Việt (app nói tiếng Việt).
const PAIR = { src: "ja", tgt: "vi" };

const MENU_ID = "gioitu-chiet-tu";
const HOVER_SCRIPT_ID = "gioitu-hanzi-hover";
const CACHE_KEY = "kanjiCache";
/** Mẫu "mọi trang" — phải khớp optional_host_permissions trong manifest. */
export const ALL_SITES = "*://*/*";

const DEFAULTS = {
  baseUrl: DEFAULT_BASE_URL,
  /** Rê chuột vào chữ là hiện thẻ (kiểu Yomitan) — cần quyền đọc trang nên mặc định tắt. */
  hover: false,
  /** Phím phải giữ khi rê: "none" | "shift" | "ctrl" | "alt". */
  modifier: "none",
  /** Dừng chuột bao lâu mới tra (ms) — quá ngắn thì thẻ nhấp nháy khi lướt qua chữ. */
  delay: 180,
};

export async function settings() {
  const saved = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...saved, baseUrl: (saved.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "") };
}

const api = createKanjiApi({
  persist: {
    load: async () => (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY],
    save: (data) => chrome.storage.local.set({ [CACHE_KEY]: data }),
  },
});

/** Mẫu quyền cho địa chỉ Gioitu — fetch chéo origin chỉ chạy khi đã được cấp. */
export function originPattern(base) {
  try {
    return `${new URL(base).origin}/*`;
  } catch {
    return null;
  }
}

async function hasHostPermission(base) {
  const origins = originPattern(base);
  if (!origins) return false;
  return chrome.permissions.contains({ origins: [origins] });
}

// --- Rê chuột: đăng ký content script động ------------------------------------
// Không nhét sẵn vào manifest: quyền đọc mọi trang chỉ xin khi người dùng thật
// sự bật chế độ này, và gỡ ra ngay khi tắt.

async function hoverRegistered() {
  const list = await chrome.scripting.getRegisteredContentScripts({ ids: [HOVER_SCRIPT_ID] });
  return list.length > 0;
}

export async function syncHoverScript() {
  const { hover } = await settings();
  const allowed = hover && (await chrome.permissions.contains({ origins: [ALL_SITES] }));
  const registered = await hoverRegistered();
  if (allowed && !registered) {
    await chrome.scripting.registerContentScripts([
      {
        id: HOVER_SCRIPT_ID,
        js: ["card.js", "content.js"],
        matches: [ALL_SITES],
        runAt: "document_idle",
        allFrames: true,
      },
    ]);
  } else if (!allowed && registered) {
    await chrome.scripting.unregisterContentScripts({ ids: [HOVER_SCRIPT_ID] });
  }
}

/** Chèn thẻ vào tab theo cử chỉ (khi chưa bật rê chuột thì trang chưa có script). */
async function showForSelection(tabId, text) {
  const message = { kind: "gioitu-hanzi-show", text: text || "" };
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Chưa có content script trên trang này → chèn theo cử chỉ (activeTab) rồi thử lại.
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["card.js", "content.js"] });
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      // Trang cấm chèn script (chrome://, cửa hàng tiện ích…) → mở thẳng trong app.
      const { baseUrl } = await settings();
      const term = (text || "").trim();
      await chrome.tabs.create({
        url: term ? `${baseUrl}/word/ja-vi/${encodeURIComponent(term)}` : baseUrl,
      });
    }
  }
}

// --- Đường dữ liệu: một port cho mỗi lượt tra --------------------------------
// Port (không phải sendMessage) vì mỗi lượt trả lời HAI lần: "quick" ngay sau
// lượt hỏi đầu để thẻ hiện ra liền, rồi "full" khi chữ con và họ chữ đã về.

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "kanji") return;
  port.onMessage.addListener(async (msg) => {
    const send = (data) => {
      try {
        port.postMessage(data);
      } catch {
        /* thẻ đã đóng, port đứt — không có gì để làm */
      }
    };
    const chars = hanCharsOf(String(msg?.text ?? ""));
    if (chars.length === 0) {
      send({ stage: "full", chars, cards: [] });
      return;
    }
    const { baseUrl } = await settings();
    if (!(await hasHostPermission(baseUrl))) {
      send({ stage: "full", chars, cards: [], error: "permission" });
      return;
    }
    const { cards, error } = await api.cards(baseUrl, PAIR, chars, (quick) =>
      send({ stage: "quick", chars, cards: quick }),
    );
    send({ stage: "full", chars, cards, error });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.kind === "gioitu-hanzi-settings") {
    settings().then(sendResponse);
    return true;
  }
  if (msg?.kind === "gioitu-hanzi-options") {
    chrome.runtime.openOptionsPage();
    return false;
  }
  if (msg?.kind === "gioitu-hanzi-open-app") {
    settings().then(({ baseUrl }) => {
      const term = (msg.term || "").trim();
      chrome.tabs.create({ url: term ? `${baseUrl}/word/ja-vi/${encodeURIComponent(term)}` : baseUrl });
    });
    return false;
  }
  if (msg?.kind === "gioitu-hanzi-sync") {
    // Trang Tuỳ chọn vừa đổi cài đặt/quyền: đăng ký lại script rê chuột, và bỏ
    // cache nếu đổi địa chỉ (dữ liệu của server khác thì không dùng lẫn được).
    if (msg.clearCache) api.clear();
    syncHoverScript().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

// Mất quyền (người dùng gỡ ở chrome://extensions) thì gỡ luôn script rê chuột.
chrome.permissions.onRemoved.addListener(() => void syncHoverScript());
chrome.permissions.onAdded.addListener(() => void syncHoverScript());
chrome.runtime.onStartup.addListener(() => void syncHoverScript());

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: 'Chiết tự “%s”', contexts: ["selection"] });
  });
  void syncHoverScript();
  // Chỉ chào lúc mới CÀI: trang Tuỳ chọn là nơi đặt địa chỉ Gioitu và cấp quyền
  // truy cập nó — thiếu hai thứ đó thì mọi lượt chiết tự đều thất bại.
  if (reason === "install") chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id) showForSelection(tab.id, info.selectionText);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "chiet-tu") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await showForSelection(tab.id, "");
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) showForSelection(tab.id, "");
});
