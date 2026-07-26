// Overlay "Thêm nhanh" cho BOOKMARKLET — bản song sinh của extension/overlay.js
// (đổi bên nào nhớ soi bên kia). Khác biệt duy nhất là đường vận chuyển: ở đây
// không có chrome.runtime, script chạy trong page world do bookmarklet chèn
// <script src> từ origin app, nên:
//   • origin app lấy từ chính src của script (document.currentScript);
//   • Lưu = mở cửa sổ tí hon ở góc màn hình `?add=…&add_save=1` — app ghi vào
//     IndexedDB của origin app rồi tự đóng cửa sổ (iframe nhúng không dùng được:
//     trình duyệt phân vùng storage bên thứ ba);
//   • "Form đầy đủ" = cửa sổ popup 520×680 như bookmarklet cũ.
// Trang có CSP chặn script ngoài sẽ không tải được file này — bookmarklet tự
// rơi về popup form đầy đủ (xem loader trong QuickAdd.tsx).

(function () {
  const HOST_ID = "gioitu-quick-add-host";
  const BASE = new URL(document.currentScript.src).origin;

  // Sao chép tối thiểu từ app (shared/languages + domain/quickadd).
  const LANG_PAIRS = [
    { id: "ja-vi", label: "Nhật → Việt" },
    { id: "vi-ja", label: "Việt → Nhật" },
    { id: "ja-en", label: "Nhật → Anh" },
    { id: "en-ja", label: "Anh → Nhật" },
    { id: "en-vi", label: "Anh → Việt" },
    { id: "vi-en", label: "Việt → Anh" },
  ];
  const JAPANESE = /[぀-ゟ゠-ヿ㐀-鿿豈-﫿]/;
  const guessPairId = (text) => (JAPANESE.test(text) ? "ja-vi" : "en-vi");

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif; }
    .card { position: fixed; z-index: 2147483647; width: 320px; background: #fff; color: #1c2130;
      border: 1px solid rgba(28, 33, 48, 0.12); border-radius: 12px; padding: 12px;
      box-shadow: 0 12px 32px rgba(15, 20, 35, 0.28); font-size: 13px; line-height: 1.45;
      transition: opacity 0.25s ease; }
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .title { font-weight: 700; font-size: 13px; }
    .close { border: 0; background: none; cursor: pointer; font-size: 16px; line-height: 1;
      padding: 2px 6px; color: inherit; opacity: 0.55; border-radius: 6px; }
    .close:hover { opacity: 1; }
    .row { display: flex; gap: 8px; margin-bottom: 8px; }
    input, select { width: 100%; padding: 7px 9px; border: 1px solid rgba(28, 33, 48, 0.2);
      border-radius: 8px; font-size: 13px; background: #fff; color: inherit; }
    input:focus, select:focus { outline: 2px solid #4f7cff; outline-offset: -1px; border-color: transparent; }
    select { width: auto; flex: 0 0 auto; }
    .grow { flex: 1 1 auto; min-width: 0; }
    .actions { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
    .link { border: 0; background: none; padding: 0; color: #4f7cff; cursor: pointer; font-size: 12.5px; }
    .link:hover { text-decoration: underline; }
    .save { border: 0; background: #4f7cff; color: #fff; font-weight: 600; padding: 7px 16px;
      border-radius: 8px; cursor: pointer; font-size: 13px; }
    .save:disabled { opacity: 0.45; cursor: default; }
    .done { display: flex; align-items: center; gap: 8px; padding: 4px 2px; font-size: 13px; }
    @media (prefers-color-scheme: dark) {
      .card { background: #232837; color: #e8ebf4; border-color: rgba(255, 255, 255, 0.09); }
      input, select { background: #1b1f2b; border-color: rgba(255, 255, 255, 0.14); }
      .link { color: #8ba7ff; }
    }
  `;

  /** Cửa sổ tí hon góc dưới-phải làm "đường ghi": app lưu xong tự đóng nó. */
  function openSaveWindow(params) {
    const left = Math.max(0, (window.screen.availWidth || 1280) - 320);
    const top = Math.max(0, (window.screen.availHeight || 800) - 220);
    window.open(`${BASE}/?${params}`, "gioitu-save", `width=300,height=180,left=${left},top=${top}`);
  }

  function openFullForm(term) {
    window.open(`${BASE}/?add=${encodeURIComponent(term || "")}`, "gioitu-add", "width=520,height=680");
  }

  function show(prefill) {
    document.getElementById(HOST_ID)?.remove();

    const selection = String(window.getSelection() || "").trim();
    const term = (prefill || "").trim() || selection;

    const host = document.createElement("div");
    host.id = HOST_ID;
    const root = host.attachShadow({ mode: "closed" });

    const style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="head">
        <span class="title">＋ Gioitu</span>
        <button class="close" type="button" aria-label="Đóng">×</button>
      </div>
      <div class="row">
        <input class="grow" name="term" placeholder="Từ (mặt chữ)" aria-label="Từ (mặt chữ)">
        <select name="pair" aria-label="Cặp ngôn ngữ"></select>
      </div>
      <div class="row"><input name="reading" placeholder="Cách đọc (tuỳ chọn)" aria-label="Cách đọc"></div>
      <div class="row"><input name="gloss" placeholder="Nghĩa (ngăn nhiều nghĩa bằng ;)" aria-label="Nghĩa"></div>
      <div class="actions">
        <button class="link" type="button">Form đầy đủ</button>
        <button class="save" type="button" disabled>Lưu</button>
      </div>
    `;
    root.appendChild(card);

    const termInput = card.querySelector('[name="term"]');
    const pairSelect = card.querySelector('[name="pair"]');
    const readingInput = card.querySelector('[name="reading"]');
    const glossInput = card.querySelector('[name="gloss"]');
    const saveBtn = card.querySelector(".save");
    for (const p of LANG_PAIRS) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      pairSelect.appendChild(opt);
    }
    termInput.value = term;
    pairSelect.value = guessPairId(term);

    // Gỡ toàn bộ listener mức document cùng lúc với overlay — không rơi rớt.
    const ac = new AbortController();
    const close = () => {
      ac.abort();
      host.remove();
    };

    const refreshSaveable = () => {
      saveBtn.disabled = !termInput.value.trim() || !glossInput.value.trim();
    };
    termInput.addEventListener("input", refreshSaveable);
    glossInput.addEventListener("input", refreshSaveable);
    // Gõ lại mặt chữ (mở không bôi đen) thì đoán lại cặp cho tới khi tự chọn tay.
    let pairTouched = false;
    pairSelect.addEventListener("change", () => (pairTouched = true));
    termInput.addEventListener("input", () => {
      if (!pairTouched) pairSelect.value = guessPairId(termInput.value);
    });

    const showSaved = (added) => {
      const done = document.createElement("div");
      done.className = "done";
      done.textContent = `✓ Đã thêm “${added}” vào hàng ôn`;
      card.replaceChildren(done);
      setTimeout(() => {
        card.style.opacity = "0";
        setTimeout(close, 250);
      }, 1400);
    };

    const save = () => {
      const t = termInput.value.trim();
      const gloss = glossInput.value.trim();
      if (!t || !gloss) return;
      const params = new URLSearchParams({ add: t, add_save: "1", add_meaning: gloss, add_pair: pairSelect.value });
      const reading = readingInput.value.trim();
      if (reading) params.set("add_reading", reading);
      openSaveWindow(params);
      // Báo xong ngay (cửa sổ góc lo phần ghi) — không bắt người đọc chờ.
      showSaved(t);
    };
    saveBtn.addEventListener("click", save);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !saveBtn.disabled) save();
    });

    card.querySelector(".close").addEventListener("click", close);
    card.querySelector(".link").addEventListener("click", () => {
      openFullForm(termInput.value.trim());
      close();
    });
    document.addEventListener("keydown", (e) => e.key === "Escape" && close(), { signal: ac.signal });
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!e.composedPath().includes(host)) close();
      },
      { signal: ac.signal },
    );

    // Đặt cạnh vùng bôi đen (dưới, hết chỗ thì trên); không có thì góc phải trên.
    (document.body || document.documentElement).appendChild(host);
    const sel = window.getSelection();
    const rect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
    const anchor = rect && (rect.width || rect.height) ? rect : null;
    const { width: w, height: h } = card.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const left = clamp(anchor ? anchor.left : vw - w - 16, 8, Math.max(8, vw - w - 8));
    const below = anchor ? anchor.bottom + 8 : 16;
    const top = anchor && below + h > vh - 8 ? Math.max(8, anchor.top - h - 8) : clamp(below, 8, Math.max(8, vh - h - 8));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;

    (term ? glossInput : termInput).focus();
    refreshSaveable();
  }

  window.__gioituOverlay = show;
})();
