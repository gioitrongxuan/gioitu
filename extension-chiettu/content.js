// Rê chuột vào chữ Hán là hiện thẻ chiết tự — lối Yomitan. Chạy trên trang
// người dùng; chỉ dò ký tự dưới con trỏ, không đọc gì khác của trang.
//
// Ba nguồn gọi chung một thẻ: rê chuột (khi bật ở Tuỳ chọn), chuột phải trên
// vùng bôi đen, phím tắt/nút toolbar. Dữ liệu do service worker lo (gọi
// `/api/kanji` + cache) và trả về HAI nhịp: "quick" ngay sau lượt hỏi đầu để
// thẻ hiện liền, "full" khi chữ con + họ chữ đã về.
//
// Tốc độ là yêu cầu chính của chế độ rê chuột, nên:
//   • chữ đã tra nằm trong cache của service worker → thẻ hiện gần như tức thì;
//   • chữ mới thì thẻ cũ vẫn đứng yên, chỉ thay bằng "đang tra" nếu quá 120ms
//     (không nhấp nháy khi lướt dọc một dòng chữ Hán);
//   • tra xong thì hỏi trước các chữ Hán liền kề — lần rê tiếp theo khỏi chờ.

(function () {
  // Đã chèn rồi (bật rê chuột mà còn gọi thêm bằng cử chỉ) — đừng gắn hai lần.
  if (window.__gioituHanzi) return;

  const HOST_ID = "gioitu-hanzi-host";
  // Bản sao một dòng của isHan bên kanji-cards.js: content script là script
  // thường, không import module được.
  const HAN = /\p{Script=Han}/u;
  // Số chữ Hán liền kề hỏi trước sau khi tra xong (làm ấm cache, không hiện ra).
  const PREFETCH = 6;
  // Chờ quá ngưỡng này mới thay nội dung cũ bằng "đang tra…" — dưới ngưỡng thì
  // dữ liệu về kịp, thay qua thay lại chỉ tổ nhấp nháy.
  const PENDING_MS = 120;
  // Rời cả chữ lẫn thẻ bấy lâu thì đóng — đủ để con trỏ đi từ chữ sang thẻ.
  const HIDE_MS = 320;

  let cfg = { hover: false, modifier: "none", delay: 180 };
  chrome.runtime.sendMessage({ kind: "gioitu-hanzi-settings" }, (s) => {
    if (!chrome.runtime.lastError && s) cfg = s;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in cfg) cfg[key] = newValue;
    }
  });

  // --- Dò chữ dưới con trỏ ---------------------------------------------------

  function caretAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }

  /**
   * Ký tự ngay dưới điểm (x, y) kèm ô chữ nhật của nó. Caret là ĐIỂM CHÈN giữa
   * hai ký tự nên phải thử cả bên phải lẫn bên trái, và chỉ nhận khi ô chữ nhật
   * thật sự chứa con trỏ — bằng không thì con trỏ đang ở lề/khoảng trắng, đoán
   * bừa sẽ hiện thẻ cho chữ người ta không trỏ vào.
   */
  function charAtPoint(x, y) {
    const caret = caretAt(x, y);
    const node = caret?.startContainer;
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.data;
    for (const start of [caret.startOffset, caret.startOffset - 1]) {
      if (start < 0 || start >= text.length) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + 1);
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      if (x >= rect.left - 1 && x <= rect.right + 1 && y >= rect.top - 1 && y <= rect.bottom + 1) {
        return { char: text[start], rect, node, index: start };
      }
    }
    return null;
  }

  /** Dải chữ Hán liền kề quanh vị trí vừa trỏ — để hỏi trước cho lần rê sau. */
  function neighbours(hit) {
    const text = hit.node.data;
    let out = "";
    for (let i = hit.index; i < text.length && out.length < PREFETCH; i += 1) {
      if (!HAN.test(text[i])) break;
      out += text[i];
    }
    for (let i = hit.index - 1; i >= 0 && out.length < PREFETCH; i -= 1) {
      if (!HAN.test(text[i])) break;
      out = text[i] + out;
    }
    return out;
  }

  function modifierOk(e) {
    switch (cfg.modifier) {
      case "shift":
        return e.shiftKey;
      case "ctrl":
        return e.ctrlKey || e.metaKey;
      case "alt":
        return e.altKey;
      default:
        return true;
    }
  }

  // --- Thẻ -------------------------------------------------------------------

  let host = null;
  let root = null;
  let card = null;
  let cardsEl = null;
  let statusEl = null;
  let anchorRect = null;
  let shownText = "";
  let pointerInCard = false;
  let token = 0;

  function build() {
    if (host) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = window.__gioituHanziCard.STYLE;
    card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="head">
        <span class="title">字 Chiết tự</span>
        <button class="close" type="button" aria-label="Đóng">×</button>
      </div>
      <div class="status" hidden></div>
      <div class="cards"></div>
    `;
    root.append(style, card);
    cardsEl = card.querySelector(".cards");
    statusEl = card.querySelector(".status");
    card.querySelector(".close").addEventListener("click", hide);
    host.addEventListener("pointerenter", () => (pointerInCard = true));
    host.addEventListener("pointerleave", () => {
      pointerInCard = false;
      scheduleHide();
    });
    (document.body || document.documentElement).appendChild(host);
  }

  function setStatus(message, kind) {
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.replaceChildren();
    statusEl.classList.toggle("err", kind === "err");
    if (!message) return;
    statusEl.append(document.createTextNode(message));
    // Thiếu quyền là chuyện sửa được ngay — kèm luôn lối đi tới đó.
    if (kind === "permission") {
      const btn = document.createElement("button");
      btn.className = "link";
      btn.type = "button";
      btn.textContent = " Mở Tuỳ chọn";
      btn.addEventListener("click", () => chrome.runtime.sendMessage({ kind: "gioitu-hanzi-options" }));
      statusEl.appendChild(btn);
    }
  }

  function place() {
    if (!card) return;
    const { width: w, height: h } = card.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const a = anchorRect;
    const left = clamp(a ? a.left : vw - w - 16, 8, Math.max(8, vw - w - 8));
    const below = a ? a.bottom + 8 : 16;
    // Không đủ chỗ bên dưới thì lật lên trên vùng neo; phần dài đã có .cards cuộn.
    const top = a && below + h > vh - 8 ? Math.max(8, a.top - h - 8) : clamp(below, 8, Math.max(8, vh - h - 8));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function renderCards(cards, chars) {
    cardsEl.replaceChildren();
    for (const k of cards) cardsEl.appendChild(window.__gioituHanziCard.cardEl(k));
    const missing = (chars || []).filter((c) => !cards.some((k) => k.literal === c));
    if (cards.length === 0) setStatus("Máy chủ Gioitu chưa có dữ liệu cấu tạo cho chữ này.");
    else setStatus(missing.length > 0 ? `Chưa có dữ liệu cho: ${missing.join(" ")}` : "");
    place();
  }

  let hideTimer = 0;
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!pointerInCard) hide();
    }, HIDE_MS);
  }

  function hide() {
    clearTimeout(hideTimer);
    token += 1;
    shownText = "";
    pointerInCard = false;
    host?.remove();
    host = root = card = cardsEl = statusEl = null;
  }

  /**
   * Hỏi service worker rồi vẽ. Trả lời cũ (người dùng đã rê sang chữ khác) bị
   * bỏ qua nhờ `token`; thẻ đang hiện KHÔNG bị xoá trắng trong lúc chờ.
   */
  function request(text, chars) {
    const mine = ++token;
    let pendingTimer = setTimeout(() => {
      if (mine === token) setStatus(`Đang tra ${chars}…`);
    }, PENDING_MS);
    let port;
    try {
      port = chrome.runtime.connect({ name: "kanji" });
    } catch {
      // Extension vừa được tải lại: context cũ chết, không còn gì để hỏi.
      clearTimeout(pendingTimer);
      hide();
      return;
    }
    port.onMessage.addListener((msg) => {
      if (mine !== token) {
        port.disconnect();
        return;
      }
      clearTimeout(pendingTimer);
      if (msg.error === "permission") {
        renderError("Chưa được cấp quyền đọc dữ liệu từ Gioitu.", "permission");
        port.disconnect();
        return;
      }
      if (msg.error) {
        renderError("Không tra được: mất mạng, hoặc máy chủ Gioitu không trả lời.", "err");
        port.disconnect();
        return;
      }
      renderCards(msg.cards ?? [], msg.chars);
      if (msg.stage !== "quick") {
        port.disconnect();
        // Hỏi trước các chữ liền kề — không vẽ gì, chỉ để lần rê sau khỏi chờ.
        const near = pendingPrefetch;
        pendingPrefetch = "";
        if (near && near !== text) prefetch(near);
      }
    });
    port.postMessage({ text });
  }

  function renderError(message, kind) {
    cardsEl.replaceChildren();
    setStatus(message, kind);
    place();
  }

  let pendingPrefetch = "";
  function prefetch(text) {
    let port;
    try {
      port = chrome.runtime.connect({ name: "kanji" });
    } catch {
      return;
    }
    port.onMessage.addListener((msg) => {
      if (msg.stage !== "quick") port.disconnect();
    });
    port.postMessage({ text });
  }

  /** Hiện thẻ cho `text`, neo vào `rect` (null = góc phải trên). */
  function show(text, rect, near) {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    build();
    anchorRect = rect;
    shownText = trimmed;
    pendingPrefetch = near || "";
    place();
    request(trimmed, trimmed);
  }

  // --- Rê chuột ---------------------------------------------------------------

  let scanTimer = 0;
  let lastX = 0;
  let lastY = 0;

  document.addEventListener(
    "mousemove",
    (e) => {
      if (!cfg.hover) return;
      // Rê trong lòng thẻ thì để yên cho người ta đọc.
      if (host && e.composedPath().includes(host)) return;
      if (!modifierOk(e)) return;
      // Rung vài pixel không phải là "trỏ sang chỗ khác".
      if (Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY) < 3) return;
      lastX = e.clientX;
      lastY = e.clientY;
      clearTimeout(scanTimer);
      const { clientX: x, clientY: y } = e;
      scanTimer = setTimeout(() => scan(x, y), Math.max(0, Number(cfg.delay) || 0));
    },
    { passive: true, capture: true },
  );

  function scan(x, y) {
    const hit = charAtPoint(x, y);
    if (!hit || !HAN.test(hit.char)) {
      // Trỏ ra khỏi chữ: đóng thẻ, trừ khi con trỏ đang nằm trong thẻ.
      if (host) scheduleHide();
      return;
    }
    if (hit.char === shownText && host) {
      clearTimeout(hideTimer);
      return;
    }
    clearTimeout(hideTimer);
    show(hit.char, hit.rect, neighbours(hit));
  }

  // --- Đường gọi bằng cử chỉ (chuột phải / phím tắt / nút toolbar) -------------

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.kind !== "gioitu-hanzi-show") return;
    const selection = window.getSelection();
    const text = (msg.text || String(selection || "")).trim().slice(0, 200).trim();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const rect = range ? range.getBoundingClientRect() : null;
    show(text, rect && (rect.width || rect.height) ? rect : null, "");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && host) hide();
  });
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (host && !e.composedPath().includes(host)) hide();
    },
    { capture: true },
  );
  // Trang cuộn thì ô neo trôi đi chỗ khác — thà đóng còn hơn chỉ sai chỗ.
  window.addEventListener("scroll", () => host && hide(), { passive: true, capture: true });

  window.__gioituHanzi = { show, hide };
})();
