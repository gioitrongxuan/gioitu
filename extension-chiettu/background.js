// Service worker (MV3) — ba đường gọi (chuột phải trên vùng bôi đen, phím tắt,
// nút thanh công cụ) đều dẫn tới overlay.js: thẻ chiết tự chèn thẳng vào trang
// đang đọc. Extension KHÔNG giữ dữ liệu và KHÔNG gọi API: dữ liệu cấu tạo chữ
// nằm ở server của app, mà extension lại đứng ở origin khác — nên overlay nhờ
// chính app tra hộ qua cửa sổ tí hon `<base>/?kanji=…` rồi nhận postMessage
// (cùng khuôn `?lookup=` của extension "Thêm nhanh từ" — quyết định #251).
// scripting + activeTab là quyền cấp theo cử chỉ: không đọc trang nào ngoài
// phần người dùng chủ động bôi đen.

// Đổi thành domain thật khi phát hành cho người dùng; để localhost cho lúc dev.
// Người dùng vẫn ghi đè được ở trang Tuỳ chọn (lưu trong chrome.storage.sync).
const DEFAULT_BASE_URL = "http://localhost:5173";

const MENU_ID = "gioitu-chiet-tu";

async function baseUrl() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Trang cấm chèn script (chrome://, cửa hàng tiện ích, trình xem PDF nội bộ…):
 * mở thẳng trang từ trong app. Ở đó vẫn có phần "Chữ Hán" của Detail Panel —
 * ít hơn thẻ chiết tự (không có lục thư) nhưng còn hơn im lặng không làm gì.
 */
async function openInApp(term) {
  const base = await baseUrl();
  const text = (term || "").trim();
  await chrome.tabs.create({ url: text ? `${base}/word/ja-vi/${encodeURIComponent(text)}` : base });
}

/** Chèn thẻ chiết tự vào tab; term rỗng thì overlay tự đọc window.getSelection(). */
async function showOverlay(tabId, term) {
  const base = await baseUrl();
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["overlay.js"] });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (t, b) => window.__gioituHanziOverlay(t, b),
      args: [term || "", base],
    });
  } catch {
    await openInApp(term);
  }
}

// Tạo lại mục chuột phải mỗi khi cài/nâng cấp (idempotent: xoá trước khi tạo).
chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Chiết tự “%s”',
      contexts: ["selection"],
    });
  });
  // Chỉ chào lúc mới CÀI: mở trang Tuỳ chọn để đặt địa chỉ Gioitu — thiếu nó thì
  // mọi lần chiết tự đều gõ cửa localhost và im lặng thất bại.
  if (reason === "install") chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id) showOverlay(tab.id, info.selectionText);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "chiet-tu") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await showOverlay(tab.id, "");
});

// Bấm biểu tượng trên thanh công cụ = chiết tự phần đang bôi đen (đường thứ ba).
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) showOverlay(tab.id, "");
});

// Overlay (content script) nhờ background làm phần cần quyền extension.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind === "gioitu-open-app") openInApp(msg.term);
});
