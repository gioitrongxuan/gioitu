// Thẻ "Chiết tự" chèn thẳng vào trang đang đọc (Shadow DOM): mỗi chữ Hán trong
// phần bôi đen thành một thẻ — mặt chữ, Hán-Việt, âm On/Kun, LỐI CẤU TẠO theo
// lục thư (tượng hình · chỉ sự · hội ý · hình thanh…) kèm phần nghĩa/phần âm
// nếu là chữ hình thanh, và các bộ phận cấu thành.
//
// Dữ liệu do CHÍNH APP tra hộ: extension ở origin khác nên không gọi được
// `/api/kanji` của app; nó mở cửa sổ tí hon `<base>/?kanji=…` ở góc màn hình,
// app hỏi server rồi postMessage kết quả về đây và tự đóng (cùng khuôn `?lookup=`
// của extension "Thêm nhanh từ" — quyết định #251). Overlay chỉ nhận message từ
// đúng origin app, đúng `kind`, đúng phần bôi đen đang hỏi.

(function () {
  const HOST_ID = "gioitu-hanzi-host";
  // Origin app do background truyền vào mỗi lần gọi (bám theo tuỳ chọn baseUrl).
  let BASE = "http://localhost:5173";
  // Tra một lượt vài chữ: vài giây là cùng. Chờ lâu hơn ngưỡng này thường là cửa
  // sổ proxy bị chặn — nói ra còn hơn treo nút vĩnh viễn.
  const KANJI_TIMEOUT_MS = 20000;
  // Khớp MAX_PROXY_KANJI của app: đếm trước ở đây chỉ để nói trước cho người
  // dùng biết sẽ thấy mấy thẻ; app vẫn là nơi cắt thật.
  const MAX_KANJI = 8;

  const HAN = /\p{Script=Han}/u;

  /** Chữ Hán trong phần bôi đen, giữ thứ tự và bỏ trùng (bản sao của app). */
  function hanCharsOf(text) {
    const seen = new Set();
    for (const c of text) {
      if (seen.size >= MAX_KANJI) break;
      if (HAN.test(c)) seen.add(c);
    }
    return [...seen];
  }

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif; }
    .card { position: fixed; z-index: 2147483647; width: 360px; background: #fff; color: #1c2130;
      border: 1px solid rgba(28, 33, 48, 0.12); border-radius: 12px; padding: 12px;
      box-shadow: 0 12px 32px rgba(15, 20, 35, 0.28); font-size: 13px; line-height: 1.45; }
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .title { font-weight: 700; font-size: 13px; }
    .close { border: 0; background: none; cursor: pointer; font-size: 16px; line-height: 1;
      padding: 2px 6px; color: inherit; opacity: 0.55; border-radius: 6px; }
    .close:hover { opacity: 1; }
    .sel { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
    .chip { font-size: 20px; line-height: 1.2; padding: 2px 8px; border-radius: 8px;
      border: 1px solid rgba(28, 33, 48, 0.14); }
    .actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .go { border: 0; background: #4f7cff; color: #fff; font-weight: 600; padding: 7px 16px;
      border-radius: 8px; cursor: pointer; font-size: 13px; }
    .go:disabled { opacity: 0.45; cursor: default; }
    .link { border: 0; background: none; padding: 0; color: #4f7cff; cursor: pointer; font-size: 12.5px; }
    .link:hover { text-decoration: underline; }
    .status { margin-top: 8px; font-size: 12.5px; color: rgba(28, 33, 48, 0.65); }
    .status.err { color: #d5484f; }
    .cards { margin-top: 10px; display: flex; flex-direction: column; gap: 8px;
      max-height: 52vh; overflow-y: auto; }
    .k { border: 1px solid rgba(28, 33, 48, 0.14); border-radius: 10px; padding: 8px 10px; }
    .k-head { display: flex; gap: 10px; align-items: baseline; }
    .k-lit { font-size: 30px; line-height: 1.1; }
    .k-meta { flex: 1 1 auto; min-width: 0; }
    .k-hanviet { font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
    .k-sub { opacity: 0.66; font-size: 12.5px; }
    .k-mean { margin-top: 2px; }
    .k-struct { margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(28, 33, 48, 0.16); }
    .k-label { font-weight: 700; }
    .k-hint { opacity: 0.72; font-size: 12.5px; }
    .k-parts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; align-items: center; }
    .part { border: 1px solid rgba(28, 33, 48, 0.14); border-radius: 7px; padding: 1px 7px; font-size: 15px; }
    .part.sem { border-color: #3aa76d; }
    .part.pho { border-color: #d58a2b; }
    .tag { font-size: 12px; opacity: 0.66; }
    @media (prefers-color-scheme: dark) {
      .card { background: #232837; color: #e8ebf4; border-color: rgba(255, 255, 255, 0.09); }
      .chip, .k, .part { border-color: rgba(255, 255, 255, 0.14); }
      .link { color: #8ba7ff; }
      .status { color: rgba(232, 235, 244, 0.65); }
      .status.err { color: #ff8087; }
      .k-struct { border-top-color: rgba(255, 255, 255, 0.16); }
      .part.sem { border-color: #57c98c; }
      .part.pho { border-color: #e6a74e; }
    }
  `;

  /** Cửa sổ tí hon góc dưới-phải: app chiết tự hộ rồi tự đóng. */
  function openCornerWindow(params) {
    const left = Math.max(0, (window.screen.availWidth || 1280) - 320);
    const top = Math.max(0, (window.screen.availHeight || 800) - 220);
    window.open(`${BASE}/?${params}`, "gioitu-kanji", `width=300,height=180,left=${left},top=${top}`);
  }

  /** Một dòng "nhãn: giá trị", bỏ hẳn dòng khi giá trị rỗng. */
  function line(parent, label, value, className) {
    if (!value) return;
    const el = document.createElement("div");
    if (className) el.className = className;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = `${label} `;
    el.append(tag, document.createTextNode(value));
    parent.appendChild(el);
  }

  function partChip(char, kind) {
    const el = document.createElement("span");
    el.className = kind ? `part ${kind}` : "part";
    el.lang = "ja";
    el.textContent = char;
    return el;
  }

  /** Một thẻ chiết tự. Dữ liệu từ app nên dựng bằng DOM, không nhét vào innerHTML. */
  function kanjiCard(k) {
    const box = document.createElement("div");
    box.className = "k";

    const head = document.createElement("div");
    head.className = "k-head";
    const lit = document.createElement("span");
    lit.className = "k-lit";
    lit.lang = "ja";
    lit.textContent = k.literal;
    const meta = document.createElement("div");
    meta.className = "k-meta";
    if (k.hanViet) {
      const hv = document.createElement("div");
      hv.className = "k-hanviet";
      hv.textContent = k.hanViet;
      meta.appendChild(hv);
    }
    const sub = document.createElement("div");
    sub.className = "k-sub";
    sub.textContent = `${k.strokeCount} nét`;
    meta.appendChild(sub);
    if (k.meanings) {
      const mean = document.createElement("div");
      mean.className = "k-mean";
      mean.textContent = k.meanings;
      meta.appendChild(mean);
    }
    line(meta, "On", k.onyomi, "k-sub");
    line(meta, "Kun", k.kunyomi, "k-sub");
    head.append(lit, meta);
    box.appendChild(head);

    const struct = document.createElement("div");
    struct.className = "k-struct";
    if (k.structure) {
      const label = document.createElement("div");
      label.className = "k-label";
      label.textContent = k.structure.label;
      const hint = document.createElement("div");
      hint.className = "k-hint";
      hint.textContent = k.structure.hint;
      struct.append(label, hint);
      // Chữ hình thanh: tách hẳn phần nghĩa với phần âm — đây chính là thứ người
      // học muốn thấy (nhìn phần âm là đoán được cách đọc của cả họ chữ).
      if (k.structure.semantic || k.structure.phonetic) {
        const parts = document.createElement("div");
        parts.className = "k-parts";
        if (k.structure.semantic) {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = "nghĩa";
          parts.append(partChip(k.structure.semantic, "sem"), tag);
        }
        if (k.structure.phonetic) {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = "âm";
          parts.append(partChip(k.structure.phonetic, "pho"), tag);
        }
        struct.appendChild(parts);
      }
    } else {
      const hint = document.createElement("div");
      hint.className = "k-hint";
      hint.textContent = "Chưa có dữ liệu lối cấu tạo cho chữ này.";
      struct.appendChild(hint);
    }
    box.appendChild(struct);

    if (k.components.length > 0) {
      const parts = document.createElement("div");
      parts.className = "k-parts";
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Bộ phận:";
      parts.appendChild(tag);
      for (const c of k.components) parts.appendChild(partChip(c));
      box.appendChild(parts);
    }

    return box;
  }

  function show(prefill, base) {
    if (base) BASE = base;
    document.getElementById(HOST_ID)?.remove();

    const selection = String(window.getSelection() || "").trim();
    // Giữ lại phần bôi đen NGAY LÚC MỞ: bấm nút trên thẻ có thể xoá selection của
    // trang, mà lúc ấy mới tới lượt gửi yêu cầu đi.
    // Trim SAU khi cắt: app cũng trim `?kanji=`, mà overlay lại khớp trả lời
    // theo đúng chuỗi đã gửi — lệch một khoảng trắng là trả lời bị bỏ qua.
    const text = ((prefill || "").trim() || selection).slice(0, 200).trim();
    const chars = hanCharsOf(text);

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
        <span class="title">字 Chiết tự</span>
        <button class="close" type="button" aria-label="Đóng">×</button>
      </div>
      <div class="sel"></div>
      <div class="actions">
        <button class="go" type="button">Chiết tự</button>
        <button class="link app" type="button">Mở trong Gioitu</button>
      </div>
      <div class="status" hidden></div>
      <div class="cards" hidden></div>
    `;
    root.appendChild(card);

    const selEl = card.querySelector(".sel");
    const goBtn = card.querySelector(".go");
    const statusEl = card.querySelector(".status");
    const cardsEl = card.querySelector(".cards");

    for (const c of chars) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.lang = "ja";
      chip.textContent = c;
      selEl.appendChild(chip);
    }

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

    // Vùng bôi đen đo MỘT LẦN lúc mở: bấm nút trên thẻ thường xoá selection của
    // trang, mà thẻ còn phải đặt lại chỗ sau khi kết quả về (nó cao thêm mấy lần).
    const sel = window.getSelection();
    const rect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
    const anchor = rect && (rect.width || rect.height) ? rect : null;

    function place() {
      const { width: w, height: h } = card.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
      const left = clamp(anchor ? anchor.left : vw - w - 16, 8, Math.max(8, vw - w - 8));
      const below = anchor ? anchor.bottom + 8 : 16;
      // Thẻ cao hơn chỗ trống bên dưới thì lật lên trên vùng bôi đen; vẫn không
      // để mép trên chạy khỏi màn hình (phần dài đã có .cards tự cuộn).
      const top =
        anchor && below + h > vh - 8 ? Math.max(8, anchor.top - h - 8) : clamp(below, 8, Math.max(8, vh - h - 8));
      card.style.left = `${left}px`;
      card.style.top = `${top}px`;
    }

    if (chars.length === 0) {
      goBtn.disabled = true;
      showStatus(
        text ? `“${text}” không có chữ Hán nào để chiết tự.` : "Bôi đen một chữ Hán rồi gọi lại.",
      );
    }

    // Trả lời quay về từ cửa sổ proxy `?kanji=` — chỉ tin đúng origin app, đúng
    // kind, và đúng phần bôi đen đang hỏi (bấm hai lần liền nhau thì có hai trả lời).
    let timer = 0;
    window.addEventListener(
      "message",
      (e) => {
        if (e.origin !== BASE) return;
        const data = e.data;
        if (!data || data.kind !== "gioitu-kanji" || data.text !== text) return;
        clearTimeout(timer);
        goBtn.disabled = chars.length === 0;
        // Dựng lại từ đầu: bấm hai lần cùng một phần bôi đen không được cộng dồn thẻ.
        cardsEl.replaceChildren();
        cardsEl.hidden = true;
        // Nguồn hỏng KHÔNG được rơi về "chữ này chưa có dữ liệu" — app gửi cờ
        // error riêng cho đúng chuyện đó (xem domain/kanjiProxy.ts).
        if (data.error) {
          showStatus(
            data.error === "network"
              ? "Không chiết tự được: mất mạng, hoặc máy chủ Gioitu không trả lời."
              : "Không chiết tự được: Gioitu gặp lỗi khi tra.",
            true,
          );
          return;
        }
        const list = data.kanji || [];
        if (list.length === 0) {
          showStatus("Máy chủ Gioitu chưa có dữ liệu cấu tạo cho chữ này.");
          return;
        }
        for (const k of list) cardsEl.appendChild(kanjiCard(k));
        cardsEl.hidden = false;
        // Thẻ vừa cao lên gấp mấy lần: đặt lại chỗ kẻo tràn khỏi mép dưới màn hình.
        place();
        const missing = (data.chars || []).filter((c) => !list.some((k) => k.literal === c));
        showStatus(missing.length > 0 ? `Chưa có dữ liệu cho: ${missing.join(" ")}` : "");
      },
      { signal: ac.signal },
    );

    // Vì sao phải bấm nút chứ không tự chạy khi thẻ hiện ra: overlay được chèn
    // theo cử chỉ ở UI trình duyệt (chuột phải / phím tắt / nút toolbar), lúc ấy
    // TRANG không có user activation nên window.open bị popup blocker chặn. Một
    // cú bấm ngay trên thẻ mới mở được cửa sổ proxy.
    goBtn.addEventListener("click", () => {
      if (chars.length === 0) return;
      goBtn.disabled = true;
      showStatus("Đang hỏi Gioitu…");
      openCornerWindow(
        new URLSearchParams({ kanji: text, kanji_pair: "ja-vi", kanji_origin: window.location.origin }),
      );
      clearTimeout(timer);
      timer = setTimeout(() => {
        goBtn.disabled = false;
        showStatus("Không nhận được trả lời từ Gioitu — cửa sổ tra bị trình duyệt chặn?", true);
      }, KANJI_TIMEOUT_MS);
    });

    card.querySelector(".app").addEventListener("click", () => {
      chrome.runtime.sendMessage({ kind: "gioitu-open-app", term: text });
      close();
    });
    card.querySelector(".close").addEventListener("click", close);
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
    place();
    goBtn.focus();
  }

  window.__gioituHanziOverlay = show;
})();
