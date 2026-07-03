// Tag resolution — turn a raw term-bank tag code ("n", "v5k", "uk") into a
// rich tag the UI can show with a full name, a colour category and a tooltip,
// the way Yomitan does. Two sources, in priority order:
//
//   1. The source dictionary's own `tag_bank_*.json` (most accurate; carries the
//      dictionary author's wording and category).
//   2. A built-in fallback covering the common JMdict part-of-speech / usage
//      codes, so even a plain dictionary that ships no tag bank still renders
//      readable, colour-coded tags.
//
// Anything still unknown degrades to {name: code, category: "default"} — the
// raw code stays visible, just uncoloured. Mirrors Yomitan's tag display:
// the compact code is the label; the full description is the hover note.

import { ResolvedTag } from "@/shared/structured-content";

/** A parsed `tag_bank` row: [name(code), category, order, notes, score]. */
export type TagBankEntry = [string, string, number, string, number];

export interface TagInfo {
  name: string;
  category: string;
  notes?: string;
}

// Yomitan colour categories. Aliases some dictionaries use ("pos", "partofspeech")
// are normalised to the canonical category so the colour still applies.
const CATEGORY_ALIASES: Record<string, string> = {
  pos: "partOfSpeech",
  partofspeech: "partOfSpeech",
  "part-of-speech": "partOfSpeech",
  pop: "popular",
  freq: "frequency",
  usage: "expression",
  register: "expression", // wty: inf / formal / slang …
  arch: "archaism",
};

export function normalizeCategory(category: string | undefined): string {
  if (!category) return "default";
  const c = category.trim();
  return CATEGORY_ALIASES[c.toLowerCase()] ?? c;
}

const POS = "partOfSpeech";
const EXPR = "expression";

// Built-in fallback. Keyed by the exact JMdict code. `[name, category, notes?]`.
const BUILTIN: Record<string, [string, string, string?]> = {
  // --- parts of speech ---
  n: ["danh từ", POS, "noun"],
  "n-adv": ["danh từ làm trạng từ", POS],
  "n-suf": ["hậu tố danh từ", POS],
  "n-pref": ["tiền tố danh từ", POS],
  "n-t": ["danh từ thời gian", POS],
  pn: ["đại từ", POS, "pronoun"],
  adj: ["tính từ", POS],
  "adj-i": ["tính từ -い", POS, "i-adjective"],
  "adj-na": ["tính từ -な", POS, "na-adjective"],
  "adj-no": ["tính từ -の", POS],
  "adj-pn": ["liên thể từ", POS, "pre-noun adjectival"],
  "adj-t": ["tính từ -たる", POS],
  "adj-f": ["bổ nghĩa danh từ", POS],
  adv: ["trạng từ", POS, "adverb"],
  "adv-to": ["trạng từ -と", POS],
  aux: ["trợ từ", POS, "auxiliary"],
  "aux-v": ["trợ động từ", POS, "auxiliary verb"],
  "aux-adj": ["trợ tính từ", POS, "auxiliary adjective"],
  conj: ["liên từ", POS, "conjunction"],
  cop: ["hệ từ", POS, "copula"],
  ctr: ["lượng từ", POS, "counter"],
  exp: ["thành ngữ / cụm từ", EXPR, "expression"],
  int: ["thán từ", POS, "interjection"],
  num: ["số từ", POS, "numeric"],
  pref: ["tiền tố", POS, "prefix"],
  prt: ["trợ từ (て・は・が…)", POS, "particle"],
  suf: ["hậu tố", POS, "suffix"],
  unc: ["chưa phân loại", "default"],
  // --- verbs ---
  v1: ["động từ nhất đoạn (ru)", POS, "ichidan verb"],
  "v1-s": ["động từ nhất đoạn (đặc biệt)", POS],
  v5: ["động từ ngũ đoạn (u)", POS, "godan verb"],
  v5u: ["động từ ngũ đoạn -う", POS],
  "v5u-s": ["động từ ngũ đoạn -う (đặc biệt)", POS],
  v5k: ["động từ ngũ đoạn -く", POS],
  "v5k-s": ["động từ ngũ đoạn 行く", POS],
  v5g: ["động từ ngũ đoạn -ぐ", POS],
  v5s: ["động từ ngũ đoạn -す", POS],
  v5t: ["động từ ngũ đoạn -つ", POS],
  v5n: ["động từ ngũ đoạn -ぬ", POS],
  v5b: ["động từ ngũ đoạn -ぶ", POS],
  v5m: ["động từ ngũ đoạn -む", POS],
  v5r: ["động từ ngũ đoạn -る", POS],
  "v5r-i": ["động từ ngũ đoạn -る (bất quy tắc)", POS],
  "v5aru": ["động từ ngũ đoạn -ある", POS],
  vk: ["động từ 来る", POS, "kuru verb"],
  vs: ["danh từ + する", POS, "suru verb"],
  "vs-i": ["động từ -する", POS],
  "vs-s": ["động từ -する (đặc biệt)", POS],
  vz: ["động từ -ずる", POS],
  vt: ["ngoại động từ", POS, "transitive verb"],
  vi: ["nội động từ", POS, "intransitive verb"],
  vn: ["động từ -ぬ bất quy tắc", POS],
  vr: ["động từ -る bất quy tắc", POS],
  iv: ["động từ bất quy tắc", POS, "irregular verb"],
  // --- usage / register ---
  uk: ["thường viết kana", EXPR, "usually written using kana alone"],
  abbr: ["viết tắt", EXPR, "abbreviation"],
  col: ["khẩu ngữ", EXPR, "colloquial"],
  sl: ["tiếng lóng", EXPR, "slang"],
  vulg: ["thô tục", EXPR, "vulgar"],
  hon: ["kính ngữ (尊敬語)", EXPR, "honorific"],
  hum: ["khiêm nhường (謙譲語)", EXPR, "humble"],
  pol: ["lịch sự (丁寧語)", EXPR, "polite"],
  fam: ["thân mật", EXPR, "familiar"],
  male: ["lối nói nam giới", EXPR],
  fem: ["lối nói nữ giới", EXPR],
  "on-mim": ["từ tượng thanh/tượng hình", EXPR, "onomatopoeia"],
  yoji: ["thành ngữ 4 chữ", EXPR, "yojijukugo"],
  proverb: ["tục ngữ", EXPR, "proverb"],
  id: ["thành ngữ", EXPR, "idiomatic expression"],
  // --- frequency / commonness ---
  P: ["thông dụng", "popular", "common word"],
  common: ["thông dụng", "popular"],
  news: ["xuất hiện trên báo", "frequent"],
  ichi: ["từ vựng cơ bản", "frequent"],
  spec: ["từ đặc biệt", "frequent"],
  // --- archaic / obsolete ---
  arch: ["cổ ngữ", "archaism", "archaic"],
  obs: ["lỗi thời", "archaism", "obsolete"],
  obsc: ["hiếm gặp", "archaism", "obscure"],
  rare: ["hiếm gặp", "archaism", "rare"],
};

// Ký hiệu gọn cho các tag phổ biến, theo lối viết tắt từ loại của từ điển
// tiếng Việt (d. = danh từ, đg. = động từ, t. = tính từ…). Màn hẹp hiện ký
// hiệu thay cho mã JMdict để hàng tag đỡ rối; tên đầy đủ vẫn ở title. Tra
// theo mã lúc render nên áp cho cả tag bank lẫn built-in, kể cả dữ liệu đã
// import từ trước.
const TAG_SYMBOLS: Record<string, string> = {};
function assignSymbol(symbol: string, codes: string[]) {
  for (const code of codes) TAG_SYMBOLS[code] = symbol;
}
assignSymbol("d.", ["n", "n-adv", "n-suf", "n-pref", "n-t"]);
assignSymbol("đ.", ["pn"]);
assignSymbol("đg.", [
  "v1", "v1-s", "v5", "v5u", "v5u-s", "v5k", "v5k-s", "v5g", "v5s", "v5t",
  "v5n", "v5b", "v5m", "v5r", "v5r-i", "v5aru", "vk", "vs", "vs-i", "vs-s",
  "vz", "vt", "vi", "vn", "vr", "iv", "aux-v",
]);
assignSymbol("t.", ["adj", "adj-i", "adj-na", "adj-no", "adj-pn", "adj-t", "adj-f", "aux-adj"]);
assignSymbol("p.", ["adv", "adv-to"]);
assignSymbol("tr.", ["prt", "aux"]);
assignSymbol("k.", ["conj"]);
assignSymbol("c.", ["int"]);
assignSymbol("s.", ["num", "ctr"]);
assignSymbol("ng.", ["exp", "id"]);
assignSymbol("★", ["P", "common", "ichi", "news", "spec"]);

/** Ký hiệu gọn của một mã tag phổ biến (undefined → UI giữ nguyên mã). */
export function tagSymbol(code: string): string | undefined {
  return TAG_SYMBOLS[code];
}

/** Build a code→TagInfo map from parsed `tag_bank` rows (later rows win ties). */
export function buildTagBank(entries: TagBankEntry[]): Map<string, TagInfo> {
  const map = new Map<string, TagInfo>();
  for (const row of entries) {
    if (!Array.isArray(row) || typeof row[0] !== "string") continue;
    const [name, category, , notes] = row;
    map.set(name, {
      name,
      category: normalizeCategory(category),
      notes: typeof notes === "string" && notes.length > 0 ? notes : undefined,
    });
  }
  return map;
}

/**
 * Resolve a single tag code against the dictionary's tag bank, then the built-in
 * table. Returns null when nothing is known (the caller keeps the bare code).
 */
export function resolveTag(code: string, bank?: Map<string, TagInfo>): ResolvedTag | null {
  const fromBank = bank?.get(code);
  if (fromBank) {
    return {
      code,
      name: fromBank.notes ?? fromBank.name ?? code,
      category: fromBank.category,
      notes: fromBank.notes,
    };
  }
  const builtin = BUILTIN[code];
  if (builtin) {
    const [name, category, notes] = builtin;
    return { code, name, category, notes };
  }
  return null;
}

/**
 * Resolve a set of tag codes into a code→ResolvedTag map (only codes we could
 * enrich are included; unknown codes are left for the UI to render bare).
 */
export function resolveTags(codes: Iterable<string>, bank?: Map<string, TagInfo>): Record<string, ResolvedTag> {
  const out: Record<string, ResolvedTag> = {};
  for (const code of codes) {
    if (out[code]) continue;
    const resolved = resolveTag(code, bank);
    if (resolved) out[code] = resolved;
  }
  return out;
}
