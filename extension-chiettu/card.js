// Phần vẽ thẻ chiết tự (Shadow DOM) — chỉ dựng DOM từ dữ liệu đã diễn giải sẵn
// của kanji-cards.js, không gọi mạng, không đụng chrome.*. Tách khỏi content.js
// để phần "khi nào hiện" và phần "hiện cái gì" sửa được độc lập.
//
// Dữ liệu đi qua textContent chứ không innerHTML: nội dung là chuỗi từ server,
// mà thẻ lại chèn vào trang của người khác.

(function () {
  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", sans-serif; }
    .card { position: fixed; z-index: 2147483647; width: 340px; background: #fff; color: #1c2130;
      border: 1px solid rgba(28, 33, 48, 0.12); border-radius: 12px; padding: 10px 12px;
      box-shadow: 0 12px 32px rgba(15, 20, 35, 0.28); font-size: 13px; line-height: 1.45;
      max-height: 70vh; display: flex; flex-direction: column; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .title { font-weight: 700; font-size: 12.5px; opacity: 0.7; }
    .close { border: 0; background: none; cursor: pointer; font-size: 16px; line-height: 1;
      padding: 0 4px; color: inherit; opacity: 0.55; border-radius: 6px; }
    .close:hover { opacity: 1; }
    .status { font-size: 12.5px; color: rgba(28, 33, 48, 0.65); }
    .status.err { color: #d5484f; }
    .link { border: 0; background: none; padding: 0; color: #4f7cff; cursor: pointer; font-size: 12.5px; }
    .link:hover { text-decoration: underline; }
    .cards { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
    .k { border: 1px solid rgba(28, 33, 48, 0.14); border-radius: 10px; padding: 8px 10px; }
    .k-head { display: flex; gap: 10px; align-items: baseline; }
    .k-lit { font-size: 30px; line-height: 1.1; }
    .k-meta { flex: 1 1 auto; min-width: 0; }
    .k-hanviet { font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
    .k-sub { opacity: 0.66; font-size: 12.5px; }
    .k-mean { margin-top: 2px; }
    .k-struct, .k-family { margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(28, 33, 48, 0.16); }
    .k-label { font-weight: 700; }
    .k-hint { opacity: 0.72; font-size: 12.5px; }
    .parts { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
    .p { display: flex; gap: 8px; align-items: baseline; }
    .p-lit { font-size: 19px; line-height: 1.2; min-width: 1.4em; text-align: center;
      border: 1px solid rgba(28, 33, 48, 0.14); border-radius: 7px; padding: 0 4px; }
    .p.sem .p-lit { border-color: #3aa76d; }
    .p.pho .p-lit { border-color: #d58a2b; }
    .p-text { flex: 1 1 auto; min-width: 0; font-size: 12.5px; }
    .p-hv { font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
    .p-mean { opacity: 0.72; }
    .tag { font-size: 12px; opacity: 0.66; }
    .tag.sec { display: block; margin-top: 8px; }
    .role { font-size: 12px; opacity: 0.66; align-self: center; }
    @media (prefers-color-scheme: dark) {
      .card { background: #232837; color: #e8ebf4; border-color: rgba(255, 255, 255, 0.09); }
      .k, .p-lit { border-color: rgba(255, 255, 255, 0.14); }
      .link { color: #8ba7ff; }
      .status { color: rgba(232, 235, 244, 0.65); }
      .status.err { color: #ff8087; }
      .k-struct, .k-family { border-top-color: rgba(255, 255, 255, 0.16); }
      .p.sem .p-lit { border-color: #57c98c; }
      .p.pho .p-lit { border-color: #e6a74e; }
    }
  `;

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

  /**
   * Một chữ con (bộ phận / phần nghĩa / phần âm / chữ cùng họ): mặt chữ +
   * Hán-Việt + nghĩa của CHÍNH NÓ. Bảng kanji không có chữ ấy (bộ thủ như 氵)
   * thì chỉ còn mặt chữ — im lặng, không bịa.
   */
  function partRow(part, kind, role) {
    const row = document.createElement("div");
    row.className = kind ? `p ${kind}` : "p";
    const lit = document.createElement("span");
    lit.className = "p-lit";
    lit.lang = "ja";
    lit.textContent = part.literal;
    row.appendChild(lit);
    const text = document.createElement("span");
    text.className = "p-text";
    if (part.hanViet) {
      const hv = document.createElement("span");
      hv.className = "p-hv";
      hv.textContent = part.hanViet;
      text.appendChild(hv);
    }
    const note = [part.meaning, part.onyomi].filter(Boolean).join(" · ");
    if (note) {
      const mean = document.createElement("span");
      mean.className = "p-mean";
      mean.textContent = part.hanViet ? ` · ${note}` : note;
      text.appendChild(mean);
    }
    row.appendChild(text);
    if (role) {
      const tag = document.createElement("span");
      tag.className = "role";
      tag.textContent = role;
      row.appendChild(tag);
    }
    return row;
  }

  /** Khối nhiều chữ con dưới một tiêu đề nhỏ. */
  function partList(parent, label, parts, kind) {
    if (!parts || parts.length === 0) return;
    const tag = document.createElement("div");
    tag.className = "tag sec";
    tag.textContent = label;
    const list = document.createElement("div");
    list.className = "parts";
    for (const p of parts) list.appendChild(partRow(p, kind));
    parent.append(tag, list);
  }

  function cardEl(k) {
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
      struct.appendChild(label);
      // Chữ hình thanh: tách hẳn phần nghĩa với phần âm — đây chính là thứ người
      // học muốn thấy (nhìn phần âm là đoán được cách đọc của cả họ chữ).
      if (k.structure.semantic || k.structure.phonetic) {
        const parts = document.createElement("div");
        parts.className = "parts";
        if (k.structure.semantic) parts.appendChild(partRow(k.structure.semantic, "sem", "phần nghĩa"));
        if (k.structure.phonetic) parts.appendChild(partRow(k.structure.phonetic, "pho", "phần âm"));
        struct.appendChild(parts);
      }
    } else {
      const hint = document.createElement("div");
      hint.className = "k-hint";
      hint.textContent = "Chưa có dữ liệu lối cấu tạo cho chữ này.";
      struct.appendChild(hint);
    }
    box.appendChild(struct);

    partList(box, "Bộ phận cấu thành", k.components);

    // Họ chữ cùng phần âm: chỗ một lần chiết tự trả công cho cả chục chữ khác.
    if (k.family) {
      const fam = document.createElement("div");
      fam.className = "k-family";
      const label = document.createElement("div");
      label.className = "k-label";
      label.textContent = k.family.label;
      fam.appendChild(label);
      const list = document.createElement("div");
      list.className = "parts";
      for (const m of k.family.members) list.appendChild(partRow(m, "pho"));
      fam.appendChild(list);
      box.appendChild(fam);
    }

    return box;
  }

  window.__gioituHanziCard = { STYLE, cardEl };
})();
