// Overlay "Thêm nhanh" chèn thẳng vào trang đang đọc (Shadow DOM) — soạn/duyệt
// tại chỗ, không rời trang. Lưu = nhắn background mở một tab nền
// `?add=…&add_save=1` để chính app ghi vào IndexedDB của origin app rồi tự đóng
// (iframe nhúng không dùng được: trình duyệt phân vùng storage bên thứ ba).
// "✨ AI điền" cũng mượn app làm hộ: mở cửa sổ tí hon `?add_ai=1` ở góc màn
// hình — app (đăng nhập sẵn, token first-party) gọi model rồi postMessage kết
// quả về đây và tự đóng; overlay chỉ nhận message từ đúng origin app.
// "Tra nghĩa" đi cùng khuôn ấy với `?lookup=…`: app tra bằng từ điển của origin
// mình (trên máy trước, hết mới hỏi server — ngoại lệ chốt ở #251) rồi trả về
// tối đa 5 dòng. Đây là lối rẻ hơn AI: từ đã cài về máy thì tra được cả khi
// offline, không tốn lượt gọi model.
// Chỉ được inject theo cử chỉ người dùng (chuột phải / phím tắt / nút toolbar),
// không thường trực trên trang nào. Bản song sinh cho bookmarklet:
// public/qa-overlay.js — đổi bên nào nhớ soi bên kia.

(function () {
  const HOST_ID = "gioitu-quick-add-host";
  // Origin app do background truyền vào mỗi lần gọi (bám theo tuỳ chọn baseUrl).
  let BASE = "http://localhost:5173";
  // AI có thể chậm; quá ngưỡng này coi như cửa sổ proxy không quay về được.
  const AI_TIMEOUT_MS = 60000;
  // Tra từ điển thì không: trên máy gần như tức thì, hỏi server cũng vài giây —
  // chờ lâu hơn ngưỡng này thường là cửa sổ proxy bị chặn, nói ra còn hơn treo.
  const LOOKUP_TIMEOUT_MS = 20000;

  // Sao chép tối thiểu từ app (shared/languages + domain/quickadd) — extension
  // đứng ngoài bundle nên không import được; đổi bên app thì đổi cả ở đây.
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
    .links { display: flex; align-items: center; gap: 10px; }
    .link { border: 0; background: none; padding: 0; color: #4f7cff; cursor: pointer; font-size: 12.5px; }
    .link:hover { text-decoration: underline; }
    .link:disabled { opacity: 0.45; cursor: default; text-decoration: none; }
    .save { border: 0; background: #4f7cff; color: #fff; font-weight: 600; padding: 7px 16px;
      border-radius: 8px; cursor: pointer; font-size: 13px; }
    .save:disabled { opacity: 0.45; cursor: default; }
    .status { margin-top: 8px; font-size: 12.5px; color: rgba(28, 33, 48, 0.65); }
    .status.err { color: #d5484f; }
    .hits { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; max-height: 168px; overflow-y: auto; }
    .hit { display: block; width: 100%; text-align: left; padding: 6px 8px; cursor: pointer;
      border: 1px solid rgba(28, 33, 48, 0.14); border-radius: 8px; background: none; color: inherit;
      font-size: 12.5px; line-height: 1.4; }
    .hit:hover { border-color: #4f7cff; }
    .hit-term { font-weight: 600; }
    .hit-gloss { display: block; opacity: 0.72; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .done { display: flex; align-items: center; gap: 8px; padding: 4px 2px; font-size: 13px; }
    @media (prefers-color-scheme: dark) {
      .card { background: #232837; color: #e8ebf4; border-color: rgba(255, 255, 255, 0.09); }
      input, select { background: #1b1f2b; border-color: rgba(255, 255, 255, 0.14); }
      .link { color: #8ba7ff; }
      .status { color: rgba(232, 235, 244, 0.65); }
      .status.err { color: #ff8087; }
      .hit { border-color: rgba(255, 255, 255, 0.14); }
      .hit:hover { border-color: #8ba7ff; }
    }
  `;

  /** Cửa sổ tí hon góc dưới-phải: app làm việc hộ (ở đây là gọi AI) rồi tự đóng. */
  function openCornerWindow(name, params) {
    const left = Math.max(0, (window.screen.availWidth || 1280) - 320);
    const top = Math.max(0, (window.screen.availHeight || 800) - 220);
    window.open(`${BASE}/?${params}`, name, `width=300,height=180,left=${left},top=${top}`);
  }

  function show(prefill, base) {
    if (base) BASE = base;
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
        <span class="links">
          <button class="link lookup" type="button">Tra nghĩa</button>
          <button class="link ai" type="button">✨ AI điền</button>
          <button class="link full" type="button">Form đầy đủ</button>
        </span>
        <button class="save" type="button" disabled>Lưu</button>
      </div>
      <div class="status" hidden></div>
      <div class="hits" hidden></div>
    `;
    root.appendChild(card);

    const termInput = card.querySelector('[name="term"]');
    const pairSelect = card.querySelector('[name="pair"]');
    const readingInput = card.querySelector('[name="reading"]');
    const glossInput = card.querySelector('[name="gloss"]');
    const saveBtn = card.querySelector(".save");
    const aiBtn = card.querySelector(".ai");
    const lookupBtn = card.querySelector(".lookup");
    const statusEl = card.querySelector(".status");
    const hitsEl = card.querySelector(".hits");
    for (const p of LANG_PAIRS) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      pairSelect.appendChild(opt);
    }
    termInput.value = term;
    pairSelect.value = guessPairId(term);

    // Gỡ toàn bộ listener mức document/window cùng lúc với overlay — không rơi rớt.
    const ac = new AbortController();
    const close = () => {
      ac.abort();
      host.remove();
    };

    const showStatus = (msg, isErr) => {
      statusEl.hidden = !msg;
      statusEl.textContent = msg || "";
      statusEl.classList.toggle("err", !!isErr);
    };

    const refreshSaveable = () => {
      saveBtn.disabled = !termInput.value.trim() || !glossInput.value.trim();
    };

    const clearHits = () => {
      hitsEl.replaceChildren();
      hitsEl.hidden = true;
    };

    /**
     * Một dòng kết quả tra. Bấm vào là chọn nghĩa đó — chọn tay thì được đè ô đã
     * có (khác ✨ AI điền: nó tự chạy nên chỉ dám điền ô trống).
     */
    const addHit = (hit) => {
      const btn = document.createElement("button");
      btn.className = "hit";
      btn.type = "button";
      const head = document.createElement("span");
      head.className = "hit-term";
      head.textContent = hit.reading && hit.reading !== hit.term ? `${hit.term}【${hit.reading}】` : hit.term;
      const gloss = document.createElement("span");
      gloss.className = "hit-gloss";
      gloss.textContent = hit.gloss;
      btn.append(head, gloss);
      btn.addEventListener("click", () => {
        if (hit.reading) readingInput.value = hit.reading;
        glossInput.value = hit.gloss;
        showStatus("Đã lấy nghĩa từ từ điển — sửa lại được rồi lưu.");
        refreshSaveable();
      });
      hitsEl.appendChild(btn);
    };

    termInput.addEventListener("input", refreshSaveable);
    glossInput.addEventListener("input", refreshSaveable);
    // Gõ lại mặt chữ (mở không bôi đen) thì đoán lại cặp cho tới khi tự chọn tay.
    let pairTouched = false;
    pairSelect.addEventListener("change", () => (pairTouched = true));
    termInput.addEventListener("input", () => {
      if (!pairTouched) pairSelect.value = guessPairId(termInput.value);
    });

    // Từ loại/ví dụ/ghi chú AI trả về — overlay không có ô riêng, giữ lại để gửi
    // kèm lúc lưu. Đổi mặt chữ là bỏ (kết quả thuộc về từ cũ).
    let extras = { pos: "", example: "", note: "" };
    // Đổi mặt chữ thì kết quả tra cũng thuộc về từ cũ — dọn luôn cho khỏi chọn nhầm.
    termInput.addEventListener("input", () => {
      extras = { pos: "", example: "", note: "" };
      clearHits();
    });

    // Kết quả AI quay về từ cửa sổ proxy của app — chỉ tin đúng origin app, đúng kind.
    let aiTimer = 0;
    window.addEventListener(
      "message",
      (e) => {
        if (e.origin !== BASE) return;
        const data = e.data;
        if (!data || data.kind !== "gioitu-ai-fill") return;
        clearTimeout(aiTimer);
        aiBtn.disabled = false;
        if (data.error) {
          showStatus(data.error, true);
          return;
        }
        const filled = data.filled || {};
        // Chỉ điền ô trống — không đè phần người dùng đã gõ.
        if (!readingInput.value.trim() && filled.reading) readingInput.value = filled.reading;
        if (!glossInput.value.trim() && filled.gloss) glossInput.value = filled.gloss;
        extras = { pos: filled.pos || "", example: filled.example || "", note: filled.note || "" };
        showStatus("✨ AI đã điền — kiểm lại rồi lưu.");
        refreshSaveable();
      },
      { signal: ac.signal },
    );

    aiBtn.addEventListener("click", () => {
      const t = termInput.value.trim();
      if (!t) {
        showStatus("Nhập mặt chữ trước đã.", true);
        return;
      }
      aiBtn.disabled = true;
      showStatus("Đang nhờ AI điền… (app mở ở cửa sổ góc màn hình)");
      openCornerWindow(
        "gioitu-ai",
        new URLSearchParams({ add: t, add_ai: "1", add_pair: pairSelect.value, add_origin: window.location.origin }),
      );
      clearTimeout(aiTimer);
      aiTimer = setTimeout(() => {
        aiBtn.disabled = false;
        showStatus("Không nhận được phản hồi từ Gioitu — đã đăng nhập app chưa?", true);
      }, AI_TIMEOUT_MS);
    });

    // Kết quả tra hộ quay về từ cửa sổ proxy `?lookup=` — cũng chỉ tin đúng origin
    // app, và bỏ qua trả lời của mặt chữ khác (bấm tra hai lần liền nhau).
    let lookupTimer = 0;
    let lookupTerm = "";
    window.addEventListener(
      "message",
      (e) => {
        if (e.origin !== BASE) return;
        const data = e.data;
        if (!data || data.kind !== "gioitu-lookup" || data.term !== lookupTerm) return;
        clearTimeout(lookupTimer);
        lookupBtn.disabled = false;
        // Bấm tra hai lần cùng một mặt chữ thì có hai trả lời — dựng lại danh sách
        // từ đầu, đừng cộng dồn.
        clearHits();
        // Nguồn hỏng KHÔNG được rơi về "không có từ" — app gửi cờ error riêng cho
        // đúng chuyện đó (xem domain/lookupProxy.ts).
        if (data.error) {
          showStatus(
            data.error === "network"
              ? "Không tra được: mất mạng hoặc server không trả lời."
              : "Không tra được: Gioitu gặp lỗi khi mở từ điển.",
            true,
          );
          return;
        }
        const hits = data.hits || [];
        if (!hits.length) {
          showStatus(`Không có “${lookupTerm}” trong từ điển đã cài — thử ✨ AI điền.`);
          return;
        }
        for (const hit of hits) addHit(hit);
        hitsEl.hidden = false;
        // Dòng đầu là dòng app đã xếp hạng cao nhất; chỉ điền ô trống, muốn nghĩa
        // khác thì bấm dòng tương ứng.
        if (!readingInput.value.trim() && hits[0].reading) readingInput.value = hits[0].reading;
        if (!glossInput.value.trim() && hits[0].gloss) glossInput.value = hits[0].gloss;
        showStatus(
          data.source === "server"
            ? "Tra từ từ điển trên server — kiểm lại rồi lưu."
            : "Tra từ từ điển trên máy — kiểm lại rồi lưu.",
        );
        refreshSaveable();
      },
      { signal: ac.signal },
    );

    lookupBtn.addEventListener("click", () => {
      const t = termInput.value.trim();
      if (!t) {
        showStatus("Nhập mặt chữ trước đã.", true);
        return;
      }
      lookupTerm = t;
      lookupBtn.disabled = true;
      clearHits();
      showStatus("Đang tra trong từ điển Gioitu…");
      openCornerWindow(
        "gioitu-lookup",
        new URLSearchParams({ lookup: t, lookup_pair: pairSelect.value, lookup_origin: window.location.origin }),
      );
      clearTimeout(lookupTimer);
      lookupTimer = setTimeout(() => {
        lookupBtn.disabled = false;
        showStatus("Không nhận được phản hồi từ Gioitu — cửa sổ tra bị trình duyệt chặn?", true);
      }, LOOKUP_TIMEOUT_MS);
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

    const draft = () => ({
      term: termInput.value.trim(),
      reading: readingInput.value.trim(),
      gloss: glossInput.value.trim(),
      pairId: pairSelect.value,
      pos: extras.pos,
      example: extras.example,
      note: extras.note,
    });

    const save = () => {
      const d = draft();
      if (!d.term || !d.gloss) return;
      chrome.runtime.sendMessage({ kind: "gioitu-quick-save", ...d });
      // Báo xong ngay (tab nền lo phần ghi) — không bắt người đọc chờ.
      showSaved(d.term);
    };
    saveBtn.addEventListener("click", save);
    card.addEventListener("keydown", (e) => {
      // Enter khi đang đứng trên một nút (tra / AI / một dòng kết quả) là bấm chính
      // nút đó — nếu vẫn lưu ở đây thì từ bị lưu với nghĩa cũ, trước cả khi dòng
      // vừa chọn kịp điền vào ô.
      if (e.key === "Enter" && e.target.tagName !== "BUTTON" && !saveBtn.disabled) save();
    });

    card.querySelector(".close").addEventListener("click", close);
    card.querySelector(".full").addEventListener("click", () => {
      // Mang theo những gì đã soạn dở — form đầy đủ mở ra không mất công gõ lại.
      chrome.runtime.sendMessage({ kind: "gioitu-open-full", ...draft() });
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
