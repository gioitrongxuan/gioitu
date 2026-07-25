// Service worker (MV3) — ba đường thêm nhanh một từ vào Gioitu, đều chỉ mở tab
// `<base>/?add=<từ>` để chính web app xử lý (form Thêm nhanh). Extension KHÔNG
// gọi API, KHÔNG đọc nội dung trang ngoài phần người dùng chủ động bôi đen:
//   • chuột phải trên vùng bôi đen → dùng luôn info.selectionText (không cần scripting)
//   • phím tắt / bấm nút thanh công cụ → lấy window.getSelection() của tab đang mở
//     qua scripting + activeTab (quyền cấp theo cử chỉ người dùng, không cần host rộng).

// Đổi thành domain thật khi phát hành cho người dùng; để localhost cho lúc dev.
// Người dùng vẫn ghi đè được ở trang Tuỳ chọn (lưu trong chrome.storage.sync).
const DEFAULT_BASE_URL = "http://localhost:5173";

const MENU_ID = "gioitu-add-selection";

async function baseUrl() {
  const { baseUrl } = await chrome.storage.sync.get("baseUrl");
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** Mở form Thêm nhanh của app với từ đã bôi đen; bỏ qua nếu rỗng. */
async function openAdd(text) {
  const term = (text || "").trim();
  if (!term) return;
  const base = await baseUrl();
  await chrome.tabs.create({ url: `${base}/?add=${encodeURIComponent(term)}` });
}

/** Lấy phần bôi đen của tab đang mở (cho phím tắt & nút thanh công cụ). */
async function addFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => String(window.getSelection() || ""),
    });
    await openAdd(result);
  } catch {
    // Trang cấm chèn script (chrome://, cửa hàng tiện ích, trình xem PDF nội bộ…):
    // không lấy được vùng bôi đen ở đó — im lặng bỏ qua.
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

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID) openAdd(info.selectionText);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "add-selection") addFromActiveTab();
});

// Bấm biểu tượng trên thanh công cụ = thêm phần đang bôi đen (đường thứ ba).
chrome.action.onClicked.addListener(() => addFromActiveTab());
