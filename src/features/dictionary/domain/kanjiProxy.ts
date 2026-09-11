// Proxy chiết tự cho extension "Chiết tự chữ Hán": bôi đen chữ Hán ở bất kỳ
// trang nào → thấy chữ ấy được dựng nên thế nào (tượng hình, hội ý, hình thanh
// với phần nghĩa + phần âm…). Cùng khuôn với `?lookup=` (domain/lookupProxy.ts):
// extension đứng ở origin khác nên không gọi được `/api/kanji` qua proxy `/api`
// của app; nó mở một cửa sổ tí hon `<app>/?kanji=…`, app tra hộ rồi postMessage
// kết quả về và tự đóng.
//
// Ở đây là phần logic thuần: đọc yêu cầu từ query param, rút chữ Hán khỏi phần
// bôi đen, diễn giải lục thư sang tiếng Việt và gói payload gọn để gửi qua
// postMessage. Phần I/O (gọi /api/kanji, postMessage, đóng cửa sổ) nằm ở
// data/kanjiProxy.ts và App.tsx.

import type { KanjiEntry, StructuralCategory } from "@/shared/kanji";
import { LANG_PAIRS, LangPair, pairById, pairId } from "@/shared/languages";
import { LookupErrorKind } from "./lookupError";
import { guessPairForText } from "./quickadd";

/** Toàn bộ query param của luồng ?kanji= — App xoá sạch khỏi URL sau khi đọc. */
export const KANJI_PARAM_KEYS = ["kanji", "kanji_pair", "kanji_origin"] as const;

/**
 * Thẻ chiết tự dựng đứng cạnh con trỏ: quá vài chữ là tràn màn hình người đọc,
 * mà bôi đen cả đoạn văn thì cũng chẳng ai đọc hết chừng ấy thẻ.
 */
export const MAX_PROXY_KANJI = 8;

const HAN = /\p{Script=Han}/u;

/**
 * Các chữ Hán trong phần bôi đen, giữ thứ tự xuất hiện và bỏ trùng (chữ lặp
 * trong một từ — 人人 — chỉ có một lối cấu tạo, hiện hai thẻ chỉ tổ chiếm chỗ).
 */
export function hanCharsOf(text: string, limit = MAX_PROXY_KANJI): string[] {
  const seen = new Set<string>();
  for (const c of text) {
    if (seen.size >= limit) break;
    if (HAN.test(c)) seen.add(c);
  }
  return [...seen];
}

export interface KanjiProxyRequest {
  /** Phần bôi đen (đã trim) — trả lại nguyên văn để overlay khớp yêu cầu/trả lời. */
  text: string;
  pair: LangPair;
  /** Origin của trang đã mở cửa sổ này — đích targetOrigin khi postMessage. */
  openerOrigin: string | null;
}

/**
 * Đọc yêu cầu chiết tự từ query param. Phần bôi đen rỗng không phải một yêu cầu
 * (không có gì để chiết) → null; ngược lại vẫn nhận cả chuỗi không có chữ Hán
 * nào, để app trả lời "không có chữ Hán" chứ không im lặng mở app bình thường.
 */
export function parseKanjiParams(params: URLSearchParams): KanjiProxyRequest | null {
  const text = (params.get("kanji") ?? "").trim();
  if (!text) return null;
  const pairParam = params.get("kanji_pair");
  const pair = LANG_PAIRS.find((p) => p.id === pairParam) ?? guessPairForText(text);
  return { text, pair, openerOrigin: params.get("kanji_origin") };
}

/**
 * Cặp ngôn ngữ để HỎI bảng kanji. Bảng chỉ có dòng tiếng Nhật (`term_lang = ja`),
 * nên cặp ngược (Việt→Nhật) hay Anh→Việt đều phải quy về "ja→<ngôn ngữ nghĩa>";
 * riêng cặp có nghĩa là tiếng Nhật thì lấy nghĩa tiếng Việt (app nói tiếng Việt).
 */
export function kanjiPairFor(pair: LangPair): LangPair {
  return pairById(pairId("ja", pair.target === "ja" ? "vi" : pair.target));
}

/**
 * Một "chữ con" (bộ phận cấu thành, phần nghĩa, phần âm, hay một chữ cùng họ)
 * kèm nghĩa + Hán-Việt của chính nó: nhìn 河 = 氵(THUỶ, nước) + 可(KHẢ) mới là
 * chiết tự, chứ hiện trần hai cái glyph thì người học vẫn phải đi tra tiếp.
 * Trường rỗng = bảng kanji không có chữ ấy (bộ thủ như 氵, 亻 thường vậy).
 */
export interface ProxyPart {
  literal: string;
  hanViet: string;
  /** Một nghĩa thôi — thẻ hẹp, và đây chỉ là chú thích cho chữ con. */
  meaning: string;
  onyomi: string;
}

export function toProxyPart(literal: string, byLiteral: ReadonlyMap<string, KanjiEntry>): ProxyPart {
  const entry = byLiteral.get(literal);
  return {
    literal,
    hanViet: (entry?.hanViet ?? []).join(", "),
    meaning: entry?.meanings[0] ?? "",
    onyomi: (entry?.onyomi ?? []).map((r) => r.text).join("、"),
  };
}

/** Lục thư của một chữ, đã diễn giải sẵn sang tiếng Việt cho overlay hiển thị. */
export interface StructureView {
  /** Mã gốc (KANJIDIC/keisei) — overlay dùng để tô nhãn, không để hiển thị. */
  type: StructuralCategory["type"];
  /** Tên lối cấu tạo, kèm chữ Hán để người học nhận mặt: "Hình thanh (形声)". */
  label: string;
  /** Một câu giải thích lối cấu tạo ấy nghĩa là gì. */
  hint: string;
  /** Chỉ chữ hình thanh: phần chỉ nghĩa và phần chỉ âm. */
  semantic?: ProxyPart;
  phonetic?: ProxyPart;
}

const STRUCTURES: Record<StructuralCategory["type"], { label: string; hint: string }> = {
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
 * Diễn giải lục thư. Chữ không có dữ liệu cấu tạo trả về null — khác hẳn
 * `unknown` (nguồn có nói tới chữ này nhưng không xếp được lối): overlay nói
 * "chưa có dữ liệu" thay vì khẳng định là không rõ.
 */
export function describeStructure(
  sc: StructuralCategory | undefined,
  byLiteral: ReadonlyMap<string, KanjiEntry> = new Map(),
): StructureView | null {
  if (!sc) return null;
  const { label, hint } = STRUCTURES[sc.type] ?? STRUCTURES.unknown;
  const view: StructureView = { type: sc.type, label, hint };
  if (sc.type === "keisei") {
    view.semantic = toProxyPart(sc.semantic, byLiteral);
    view.phonetic = toProxyPart(sc.phonetic, byLiteral);
  }
  return view;
}

/** Số chữ cùng họ hiện trên một thẻ — đủ thấy quy luật, chưa thành bức tường chữ. */
export const MAX_FAMILY = 10;

/** Trần số chữ hỏi thêm ở lượt "họ chữ": một request, không phải cả từ điển. */
export const MAX_FAMILY_FETCH = 40;

/**
 * Họ chữ cùng phần âm — thứ trả công cho việc học chiết tự: 可 (KHẢ) kéo theo
 * 何 河 荷 歌, tất cả đều đọc カ. Hai chiều:
 *   • chữ hình thanh → họ của PHẦN ÂM của nó (các anh em cùng phần âm);
 *   • chữ tự đứng làm phần âm (可, 青…) → những chữ dựng trên nó.
 * Danh sách ấy nằm sẵn ở `keiseiPhonetic` của chữ làm phần âm.
 */
export interface KanjiFamily {
  /** Chữ làm phần âm chung. */
  phonetic: string;
  /** Chưa cắt bớt — nơi gọi tự xếp theo độ phổ biến rồi cắt (xem toProxyKanji). */
  members: string[];
}

export function familyOf(
  entry: KanjiEntry,
  byLiteral: ReadonlyMap<string, KanjiEntry>,
): KanjiFamily | null {
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

/** Họ chữ đã diễn giải sẵn cho overlay. */
export interface ProxyFamily {
  phonetic: ProxyPart;
  /** Câu dẫn — khác nhau tuỳ chữ đang xét là "anh em" hay chính là phần âm. */
  label: string;
  hint: string;
  members: ProxyPart[];
}

/**
 * Chữ cần hỏi thêm để "chữ con" có nghĩa và Hán-Việt: bộ phận cấu thành, phần
 * nghĩa và phần âm của mọi chữ vừa tra. Bỏ chính các chữ đã tra (đã có dữ liệu).
 */
export function partCharsOf(entries: readonly KanjiEntry[]): string[] {
  const out = new Set<string>();
  for (const e of entries) {
    for (const c of e.components) out.add(c);
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
export function familyCharsOf(
  entries: readonly KanjiEntry[],
  byLiteral: ReadonlyMap<string, KanjiEntry>,
  limit = MAX_FAMILY_FETCH,
): string[] {
  const out = new Set<string>();
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

/**
 * Một thẻ chiết tự cho overlay. Các trường của chính chữ ấy đã gộp sẵn thành
 * chuỗi (overlay nằm ngoài bundle, càng ít logic càng tốt); chữ con thì giữ
 * dạng ProxyPart vì mỗi cái còn phải hiện Hán-Việt + nghĩa riêng.
 */
export interface ProxyKanji {
  literal: string;
  hanViet: string;
  meanings: string;
  onyomi: string;
  kunyomi: string;
  strokeCount: number;
  /** Bộ phận cấu thành; đã bỏ chính chữ đang xét nếu nguồn kể cả nó. */
  components: ProxyPart[];
  structure: StructureView | null;
  family: ProxyFamily | null;
}

/**
 * Bộ phận còn lại sau khi đã kể riêng ở khối lục thư. `components` của nguồn kể
 * cả chính chữ đang xét (xem attachStructure ở server) — thừa; còn với chữ hình
 * thanh thì phần nghĩa/phần âm đã đứng ngay trên với chú thích đầy đủ, nhắc lại
 * y nguyên ở "bộ phận" chỉ khiến thẻ dài ra mà không thêm gì. Phần sâu hơn
 * (thành phần của chính phần âm) thì vẫn giữ — đó mới là cái chưa nói.
 */
export function extraComponents(entry: KanjiEntry): string[] {
  const shown = new Set<string>([entry.literal]);
  const sc = entry.structuralCategory;
  if (sc?.type === "keisei") {
    shown.add(sc.semantic);
    shown.add(sc.phonetic);
  }
  return entry.components.filter((c) => !shown.has(c));
}

/** Xếp họ chữ theo độ phổ biến (chữ hay gặp trước) rồi cắt; hoà thì giữ thứ tự nguồn. */
function rankFamily(members: readonly string[], byLiteral: ReadonlyMap<string, KanjiEntry>): string[] {
  return members
    .map((c, i) => ({ c, i, score: byLiteral.get(c)?.score ?? 0 }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_FAMILY)
    .map((m) => m.c);
}

/** Rút một KanjiEntry thành thẻ chiết tự; `byLiteral` là mọi chữ đã tra được. */
export function toProxyKanji(entry: KanjiEntry, byLiteral: ReadonlyMap<string, KanjiEntry> = new Map()): ProxyKanji {
  const fam = familyOf(entry, byLiteral);
  return {
    literal: entry.literal,
    hanViet: (entry.hanViet ?? []).join(", "),
    meanings: entry.meanings.join("; "),
    onyomi: entry.onyomi.map((r) => r.text).join("、"),
    kunyomi: entry.kunyomi.map((r) => r.text).join("、"),
    strokeCount: entry.strokeCount,
    components: extraComponents(entry).map((c) => toProxyPart(c, byLiteral)),
    structure: describeStructure(entry.structuralCategory, byLiteral),
    family: fam
      ? {
          phonetic: toProxyPart(fam.phonetic, byLiteral),
          label:
            fam.phonetic === entry.literal
              ? `Những chữ dùng ${entry.literal} làm phần âm`
              : `Chữ cùng phần âm ${fam.phonetic}`,
          hint: "Cùng phần âm thì âm On thường giống nhau — thuộc một chữ là đoán được cả họ.",
          members: rankFamily(fam.members, byLiteral).map((c) => toProxyPart(c, byLiteral)),
        }
      : null,
  };
}

export const KANJI_REPLY_KIND = "gioitu-kanji";

/**
 * Vì sao không chiết tự được: nguồn hỏng ("network" — mất mạng, deploy tĩnh
 * không có `/api`), hoặc trục trặc ngoài dự tính ("failed"). Cả hai đều KHÔNG
 * được rơi về "chữ này không có dữ liệu" — cùng cái bẫy `lookupError.ts` tránh.
 */
export type KanjiProxyErrorKind = LookupErrorKind | "failed";

/** Payload postMessage về overlay. Chỉ dữ liệu thuần — nó đi qua ranh giới origin. */
export interface KanjiProxyReply {
  kind: typeof KANJI_REPLY_KIND;
  /** Phần bôi đen đã yêu cầu — overlay bỏ qua trả lời của phần bôi đen khác. */
  text: string;
  /** Các chữ Hán rút được; rỗng = phần bôi đen không có chữ Hán nào. */
  chars: string[];
  kanji: ProxyKanji[];
  error?: KanjiProxyErrorKind;
}

/**
 * Gói kết quả tra. Sắp theo thứ tự chữ trong phần bôi đen chứ không theo thứ tự
 * hàng trả về (bảng kanji không hứa thứ tự), để thẻ đọc xuôi như chữ trên trang;
 * chữ nào bảng không có thì vắng thẻ — overlay tự nói ra phần chênh lệch.
 * `entries` là MỌI chữ đã tra được (chữ được chọn + chữ con + họ chữ): thẻ chỉ
 * dựng cho `chars`, phần còn lại là nguồn chú thích cho chữ con.
 */
export function buildKanjiReply(
  text: string,
  chars: readonly string[],
  entries: readonly KanjiEntry[],
  error?: KanjiProxyErrorKind,
): KanjiProxyReply {
  const byLiteral = new Map(entries.map((e) => [e.literal, e]));
  const kanji = chars.flatMap((c) => {
    const entry = byLiteral.get(c);
    return entry ? [toProxyKanji(entry, byLiteral)] : [];
  });
  const reply: KanjiProxyReply = { kind: KANJI_REPLY_KIND, text, chars: [...chars], kanji };
  if (error) reply.error = error;
  return reply;
}

/** Lượt tra ném ngoại lệ: vẫn phải trả lời overlay, nhưng nói rõ là hỏng chứ không rỗng. */
export function failedKanjiReply(text: string): KanjiProxyReply {
  return { kind: KANJI_REPLY_KIND, text, chars: [], kanji: [], error: "failed" };
}
