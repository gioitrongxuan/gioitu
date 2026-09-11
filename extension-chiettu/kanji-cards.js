// Dựng thẻ chiết tự từ dữ liệu thô của `/api/kanji` — LOGIC THUẦN, không chạm
// chrome.* lẫn DOM, nên chạy được cả trong service worker lẫn dưới vitest
// (test/kanjiCards.test.ts). Đây là bản duy nhất: app không có đường chiết tự
// riêng, extension gọi thẳng API rồi tự dựng thẻ.
//
// Vào: KanjiEntry[] của server (xem src/shared/kanji.ts). Ra: thẻ đã diễn giải
// sẵn sang tiếng Việt — phần hiển thị (card.js) chỉ việc đổ ra DOM.

const HAN = /\p{Script=Han}/u;

/** Một chữ có phải chữ Hán không (dùng cả khi dò chữ dưới con trỏ). */
export const isHan = (c) => HAN.test(c);

/**
 * Thẻ chiết tự dựng cạnh con trỏ: quá vài chữ là tràn màn hình người đọc, mà
 * bôi đen cả đoạn văn thì cũng chẳng ai đọc hết chừng ấy thẻ.
 */
export const MAX_KANJI = 8;

/** Số chữ cùng họ hiện trên một thẻ — đủ thấy quy luật, chưa thành bức tường chữ. */
export const MAX_FAMILY = 10;

/** Trần số chữ hỏi thêm ở lượt "họ chữ": một request, không phải cả từ điển. */
export const MAX_FAMILY_FETCH = 40;

/** Chữ Hán trong một chuỗi, giữ thứ tự xuất hiện và bỏ trùng. */
export function hanCharsOf(text, limit = MAX_KANJI) {
  const seen = new Set();
  for (const c of text ?? "") {
    if (seen.size >= limit) break;
    if (HAN.test(c)) seen.add(c);
  }
  return [...seen];
}

const STRUCTURES = {
  shoukei: {
    label: "Tượng hình (象形)",
    hint: "Vẽ lại hình dáng vật thật — nhìn ra vật thì nhớ được chữ.",
  },
  shiji: {
    label: "Chỉ sự (指事)",
    hint: "Dấu hiệu quy ước chỉ thẳng vào một ý trừu tượng (trên, dưới, một, hai).",
  },
  kaii: {
    label: "Hội ý (会意)",
    hint: "Ghép nghĩa của các phần thành nghĩa mới; không phần nào chỉ âm.",
  },
  keisei: {
    label: "Hình thanh (形声)",
    hint: "Một phần chỉ nghĩa, một phần chỉ âm — lối dựng của phần lớn chữ Hán.",
  },
  kokuji: {
    label: "Quốc tự (国字)",
    hint: "Chữ người Nhật tự đặt, thường theo lối hội ý nên hay không có âm On.",
  },
  shinjitai: {
    label: "Tân tự thể (新字体)",
    hint: "Dạng giản lược thời nay của một chữ cũ — lối cấu tạo phải xem ở chữ gốc.",
  },
  derivative: {
    label: "Chuyển chú (転注)",
    hint: "Dùng một chữ sẵn có cho nghĩa phái sinh của chính nó.",
  },
  rebus: {
    label: "Giả tá (仮借)",
    hint: "Mượn chữ đồng âm để ghi một từ khác nghĩa, không liên quan nghĩa gốc.",
  },
  unknown: {
    label: "Chưa rõ lối cấu tạo",
    hint: "Nguồn dữ liệu không xếp chữ này vào lối nào trong lục thư.",
  },
};

/**
 * Một "chữ con" (bộ phận cấu thành, phần nghĩa, phần âm, hay chữ cùng họ) kèm
 * nghĩa + Hán-Việt của CHÍNH NÓ: nhìn 河 = 氵(THUỶ, nước) + 可(KHẢ) mới là chiết
 * tự, chứ hiện trần hai cái glyph thì người học vẫn phải đi tra tiếp. Trường
 * rỗng = bảng kanji không có chữ ấy (bộ thủ như 氵, 亻 thường vậy).
 */
export function toPart(literal, byLiteral) {
  const entry = byLiteral.get(literal);
  return {
    literal,
    hanViet: (entry?.hanViet ?? []).join(", "),
    meaning: entry?.meanings?.[0] ?? "",
    onyomi: (entry?.onyomi ?? []).map((r) => r.text).join("、"),
  };
}

/**
 * Diễn giải lục thư. Chữ không có dữ liệu cấu tạo trả về null — khác hẳn
 * `unknown` (nguồn có nói tới chữ này nhưng không xếp được lối): thẻ nói "chưa
 * có dữ liệu" thay vì khẳng định là không rõ.
 */
export function describeStructure(sc, byLiteral = new Map()) {
  if (!sc) return null;
  const { label, hint } = STRUCTURES[sc.type] ?? STRUCTURES.unknown;
  const view = { type: sc.type, label, hint };
  if (sc.type === "keisei") {
    view.semantic = toPart(sc.semantic, byLiteral);
    view.phonetic = toPart(sc.phonetic, byLiteral);
  }
  return view;
}

/**
 * Họ chữ cùng phần âm — thứ trả công cho việc học chiết tự: 可 (KHẢ) kéo theo
 * 何 河 荷 歌, tất cả đều đọc カ. Hai chiều:
 *   • chữ hình thanh → họ của PHẦN ÂM của nó (các anh em cùng phần âm);
 *   • chữ tự đứng làm phần âm (可, 青…) → những chữ dựng trên nó.
 * Danh sách ấy nằm sẵn ở `keiseiPhonetic` của chữ làm phần âm.
 */
export function familyOf(entry, byLiteral) {
  const sc = entry.structuralCategory;
  if (sc?.type === "keisei") {
    const head = byLiteral.get(sc.phonetic);
    const members = (head?.keiseiPhonetic ?? []).filter((c) => c !== entry.literal);
    if (members.length > 0) return { phonetic: sc.phonetic, members };
  }
  // Không phải hình thanh (hoặc chưa tra được chữ làm phần âm): chính nó có thể
  // đang làm phần âm cho chữ khác.
  const own = (entry.keiseiPhonetic ?? []).filter((c) => c !== entry.literal);
  if (own.length > 0) return { phonetic: entry.literal, members: own };
  return null;
}

/**
 * Bộ phận còn lại sau khi đã kể riêng ở khối lục thư. `components` của nguồn kể
 * cả chính chữ đang xét (xem attachStructure ở server) — thừa; còn với chữ hình
 * thanh thì phần nghĩa/phần âm đã đứng ngay trên với chú thích đầy đủ, nhắc lại
 * y nguyên ở "bộ phận" chỉ khiến thẻ dài ra mà không thêm gì. Phần sâu hơn
 * (thành phần của chính phần âm) thì vẫn giữ — đó mới là cái chưa nói.
 */
export function extraComponents(entry) {
  const shown = new Set([entry.literal]);
  const sc = entry.structuralCategory;
  if (sc?.type === "keisei") {
    shown.add(sc.semantic);
    shown.add(sc.phonetic);
  }
  return (entry.components ?? []).filter((c) => !shown.has(c));
}

/**
 * Chữ cần hỏi thêm để "chữ con" có nghĩa và Hán-Việt: bộ phận cấu thành, phần
 * nghĩa và phần âm của mọi chữ vừa tra. Bỏ chính các chữ đã tra (đã có dữ liệu).
 */
export function partCharsOf(entries) {
  const out = new Set();
  for (const e of entries) {
    for (const c of e.components ?? []) out.add(c);
    const sc = e.structuralCategory;
    if (sc?.type === "keisei") {
      out.add(sc.semantic);
      out.add(sc.phonetic);
    }
  }
  for (const e of entries) out.delete(e.literal);
  return [...out];
}

/**
 * Chữ cần hỏi ở lượt cuối: thành viên các họ chữ, để chúng cũng có Hán-Việt và
 * âm On (nhìn cả họ cùng đọc カ mới ra quy luật). Cắt ở `limit` cho một request
 * gọn; chữ rơi ra ngoài vẫn hiện được mặt chữ, chỉ thiếu chú thích.
 */
export function familyCharsOf(entries, byLiteral, limit = MAX_FAMILY_FETCH) {
  const out = new Set();
  for (const e of entries) {
    const fam = familyOf(e, byLiteral);
    if (!fam) continue;
    for (const m of fam.members) {
      if (out.size >= limit) break;
      if (!byLiteral.has(m)) out.add(m);
    }
  }
  return [...out];
}

/** Xếp họ chữ theo độ phổ biến (chữ hay gặp trước) rồi cắt; hoà thì giữ thứ tự nguồn. */
function rankFamily(members, byLiteral) {
  return members
    .map((c, i) => ({ c, i, score: byLiteral.get(c)?.score ?? 0 }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_FAMILY)
    .map((m) => m.c);
}

/** Một thẻ chiết tự đã diễn giải sẵn; `byLiteral` là mọi chữ đã tra được. */
export function toCard(entry, byLiteral = new Map()) {
  const fam = familyOf(entry, byLiteral);
  return {
    literal: entry.literal,
    hanViet: (entry.hanViet ?? []).join(", "),
    meanings: (entry.meanings ?? []).join("; "),
    onyomi: (entry.onyomi ?? []).map((r) => r.text).join("、"),
    kunyomi: (entry.kunyomi ?? []).map((r) => r.text).join("、"),
    strokeCount: entry.strokeCount ?? 0,
    components: extraComponents(entry).map((c) => toPart(c, byLiteral)),
    structure: describeStructure(entry.structuralCategory, byLiteral),
    family: fam
      ? {
          phonetic: toPart(fam.phonetic, byLiteral),
          label:
            fam.phonetic === entry.literal
              ? `Những chữ dùng ${entry.literal} làm phần âm`
              : `Chữ cùng phần âm ${fam.phonetic}`,
          hint: "Cùng phần âm thì âm On thường giống nhau — thuộc một chữ là đoán được cả họ.",
          members: rankFamily(fam.members, byLiteral).map((c) => toPart(c, byLiteral)),
        }
      : null,
  };
}

/**
 * Thẻ cho từng chữ được hỏi, sắp theo thứ tự chữ trên trang chứ không theo thứ
 * tự hàng trả về (bảng kanji không hứa thứ tự); chữ nào bảng không có thì vắng
 * thẻ — nơi gọi tự nói ra phần chênh lệch. `entries` là MỌI chữ đã tra được
 * (chữ được hỏi + chữ con + họ chữ): phần dôi ra là nguồn chú thích.
 */
export function buildCards(chars, entries) {
  const byLiteral = entries instanceof Map ? entries : new Map(entries.map((e) => [e.literal, e]));
  return chars.flatMap((c) => {
    const entry = byLiteral.get(c);
    return entry ? [toCard(entry, byLiteral)] : [];
  });
}
