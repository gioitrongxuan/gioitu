// Trang tuỳ chọn: địa chỉ Gioitu, quyền truy cập, và chế độ rê chuột.
//
// Quyền phải xin TỪ ĐÂY: chrome.permissions.request chỉ chạy trong một cử chỉ
// của người dùng trên trang của extension. Hai quyền khác nhau, xin riêng:
//   • địa chỉ Gioitu (bắt buộc, để gọi /api/kanji);
//   • mọi trang (chỉ khi bật rê chuột — content script phải nằm sẵn trên trang).

const ALL_SITES = "*://*/*";

const input = document.getElementById("baseUrl");
const status = document.getElementById("status");
const permState = document.getElementById("permState");
const hover = document.getElementById("hover");
const modifier = document.getElementById("modifier");
const delay = document.getElementById("delay");

function flash(message) {
  status.textContent = message;
  setTimeout(() => (status.textContent = ""), 2000);
}

/** Mẫu quyền cho một địa chỉ; null nếu chưa phải URL dùng được. */
function originPattern(base) {
  try {
    return `${new URL(base).origin}/*`;
  } catch {
    return null;
  }
}

const saved = () => chrome.storage.sync.get({ baseUrl: "", hover: false, modifier: "none", delay: 180 });

/** Nhắc background đăng ký/gỡ content script sau khi đổi cài đặt hoặc quyền. */
const sync = (clearCache = false) => chrome.runtime.sendMessage({ kind: "gioitu-hanzi-sync", clearCache });

async function refreshPermState() {
  const { baseUrl } = await saved();
  const origins = originPattern(baseUrl || "");
  if (!origins) {
    permState.className = "warn";
    permState.textContent = "Chưa lưu địa chỉ Gioitu — extension chưa tra được gì.";
    return;
  }
  const ok = await chrome.permissions.contains({ origins: [origins] });
  permState.className = ok ? "ok" : "warn";
  permState.textContent = ok
    ? `✓ Đã được phép đọc dữ liệu từ ${origins}`
    : `Chưa được phép đọc dữ liệu từ ${origins} — bấm “Cấp quyền truy cập địa chỉ này”.`;
}

async function load() {
  const s = await saved();
  if (s.baseUrl) input.value = s.baseUrl;
  hover.checked = s.hover;
  modifier.value = s.modifier;
  delay.value = s.delay;
  await refreshPermState();
}
load();

document.getElementById("save").addEventListener("click", async () => {
  const value = input.value.trim().replace(/\/+$/, "");
  if (value && !/^https?:\/\//i.test(value)) {
    flash("Địa chỉ phải bắt đầu bằng http:// hoặc https://");
    return;
  }
  const { baseUrl: old } = await saved();
  await chrome.storage.sync.set({ baseUrl: value });
  // Đổi địa chỉ = đổi máy chủ: chữ đã nhớ của máy chủ cũ không dùng lẫn được.
  await sync(value !== old);
  flash("Đã lưu.");
  await refreshPermState();
});

document.getElementById("grant").addEventListener("click", async () => {
  const origins = originPattern(input.value.trim().replace(/\/+$/, ""));
  if (!origins) {
    flash("Nhập địa chỉ Gioitu trước đã.");
    return;
  }
  // Xin quyền cho đúng địa chỉ đang gõ, nhưng chỉ lưu khi người dùng đồng ý —
  // để trạng thái hiện ra không nói dối về địa chỉ đã lưu.
  const granted = await chrome.permissions.request({ origins: [origins] });
  if (granted) {
    await chrome.storage.sync.set({ baseUrl: input.value.trim().replace(/\/+$/, "") });
    await sync();
  }
  flash(granted ? "Đã cấp quyền." : "Bạn đã từ chối — extension sẽ không tra được.");
  await refreshPermState();
});

hover.addEventListener("change", async () => {
  if (hover.checked) {
    const granted = await chrome.permissions.request({ origins: [ALL_SITES] });
    if (!granted) {
      hover.checked = false;
      flash("Cần quyền đọc trang thì mới rê chuột được.");
      return;
    }
  } else {
    // Tắt thì trả lại quyền luôn, đừng giữ thứ không dùng tới.
    await chrome.permissions.remove({ origins: [ALL_SITES] });
  }
  await chrome.storage.sync.set({ hover: hover.checked });
  await sync();
  flash(hover.checked ? "Đã bật rê chuột." : "Đã tắt rê chuột.");
});

modifier.addEventListener("change", () => chrome.storage.sync.set({ modifier: modifier.value }));
delay.addEventListener("change", () => {
  const ms = Math.min(2000, Math.max(0, Number(delay.value) || 0));
  delay.value = ms;
  chrome.storage.sync.set({ delay: ms });
});

// chrome://extensions/shortcuts là nơi DUY NHẤT đổi được phím tắt (Chrome không
// cho extension tự gán). Trang tiện ích mở được bằng chrome.tabs.create.
document.getElementById("shortcuts").addEventListener("click", () => {
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});
