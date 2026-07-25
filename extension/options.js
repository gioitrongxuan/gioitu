// Trang tuỳ chọn — chỉ lưu/đọc địa chỉ Gioitu vào chrome.storage.sync (đồng bộ
// theo tài khoản trình duyệt) và mở màn phím tắt hệ thống. Không có logic khác.

const input = document.getElementById("baseUrl");
const status = document.getElementById("status");

function flash(message) {
  status.textContent = message;
  setTimeout(() => (status.textContent = ""), 2000);
}

chrome.storage.sync.get("baseUrl").then(({ baseUrl }) => {
  if (baseUrl) input.value = baseUrl;
});

document.getElementById("save").addEventListener("click", async () => {
  const value = input.value.trim().replace(/\/+$/, "");
  if (value && !/^https?:\/\//i.test(value)) {
    flash("Địa chỉ phải bắt đầu bằng http:// hoặc https://");
    return;
  }
  await chrome.storage.sync.set({ baseUrl: value });
  flash("Đã lưu.");
});

// chrome://extensions/shortcuts là nơi DUY NHẤT đổi được phím tắt (Chrome không
// cho extension tự gán). Trang tiện ích mở được bằng chrome.tabs.create.
document.getElementById("shortcuts").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});
