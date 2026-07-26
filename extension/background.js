// Service worker (MV3) — ba đường lượm một từ khi lướt web (chuột phải trên vùng
// bôi đen, phím tắt, nút thanh công cụ) đều dẫn tới overlay.js: form nhỏ chèn
// thẳng vào trang đang đọc, soạn xong lưu ngầm — KHÔNG rời trang. Lưu ngầm = mở
// tab nền `<base>/?add=…&add_save=1` để chính app ghi vào storage của origin app
// rồi tự đóng tab. Trang cấm chèn script (chrome://, cửa hàng tiện ích, trình xem
// PDF nội bộ…) thì rơi về cửa sổ popup nhỏ mở form đầy đủ của app.
// Extension KHÔNG gọi API, KHÔNG đọc nội dung trang ngoài phần người dùng chủ
// động bôi đen: scripting + activeTab là quyền cấp theo cử chỉ, không cần host rộng.

// Đổi thành domain thật khi phát hành cho người dùng; để localhost cho lúc dev.
// Người dùng vẫn ghi đè được ở trang Tuỳ chọn (lưu trong chrome.storage.sync).
const DEFAULT_BASE_URL = "http://localhost:5173";

const MENU_ID = "gioitu-add-selection";

async function baseUrl() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** Cửa sổ popup nhỏ mở form đầy đủ của app (fallback + nút "Form đầy đủ" trên overlay). */
async function openFullForm(term) {
  const base = await baseUrl();
  await chrome.windows.create({
    url: `${base}/?add=${encodeURIComponent((term || "").trim())}`,
    type: "popup",
    width: 520,
    height: 680,
  });
}

/** Lưu ngầm một từ đã soạn trên overlay: tab nền mở app kèm add_save=1, app ghi xong tự đóng. */
async function saveInBackground({ term, reading, gloss, pairId }) {
  const base = await baseUrl();
  const params = new URLSearchParams({ add: term, add_save: "1" });
  if (reading) params.set("add_reading", reading);
  if (gloss) params.set("add_meaning", gloss);
  if (pairId) params.set("add_pair", pairId);
  await chrome.tabs.create({ url: `${base}/?${params}`, active: false });
}

/** Chèn overlay vào tab; term rỗng thì overlay tự đọc window.getSelection(). */
async function showOverlay(tabId, term) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["overlay.js"] });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (t) => window.__gioituOverlay(t),
      args: [term || ""],
    });
  } catch {
    await openFullForm(term);
  }
}

// Tạo lại mục chuột phải mỗi khi cài/nâng cấp (idempotent: xoá trước khi tạo).
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Thêm “%s” vào Gioitu',
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id) showOverlay(tab.id, info.selectionText);
});

async function showOverlayOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await showOverlay(tab.id, "");
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "add-selection") showOverlayOnActiveTab();
});

// Bấm biểu tượng trên thanh công cụ = overlay với phần đang bôi đen (đường thứ ba).
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) showOverlay(tab.id, "");
});

// Overlay (content script) nhờ background làm phần cần quyền extension.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind === "gioitu-quick-save") saveInBackground(msg);
  else if (msg?.kind === "gioitu-open-full") openFullForm(msg.term);
});
