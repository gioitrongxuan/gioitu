// Japanese (and light English) deinflection — the core of a Yomitan-style
// look-up. When you type an inflected word (e.g. 食べさせられました) we walk it
// back to candidate dictionary forms (食べる) while recording the chain of
// grammatical reasons (polite → causative → passive → …).
//
// This ports the classic Yomichan/Yomitan deinflection ALGORITHM (a breadth
// search over suffix-rewrite rules constrained by word-type bit flags) with a
// hand-curated, unit-tested rule table covering the common inflections.
//
//   rule = [kanaIn, kanaOut, rulesIn, rulesOut]
//   start: term = input, rules = 0 (unconstrained), reasons = []
//   a rule applies when (rules === 0 || (rules & rulesIn) !== 0)
//                   and  term.endsWith(kanaIn)
//   → newTerm = term[..-kanaIn] + kanaOut ; newRules = rulesOut
//   a deinflection matches a dictionary entry when the entry's word-type is
//   compatible with the candidate's `rules` (see rulesMatchEntry).

import { romajiToHiragana } from "./romaji";

/** Word-type flags. v* / adji are "real" (match dictionary entries); the rest
 *  are pseudo-types used only to chain rules (no dictionary entry carries them). */
export const RULE = {
  v1: 1 << 0, // ichidan (る) verb
  v5: 1 << 1, // godan verb
  vs: 1 << 2, // する verb
  vk: 1 << 3, // 来る verb
  adji: 1 << 4, // い-adjective
  te: 1 << 5, // pseudo: て / で connective form
} as const;

type RuleName = keyof typeof RULE;

function bits(names: RuleName[]): number {
  let b = 0;
  for (const n of names) b |= RULE[n];
  return b;
}

interface Rule {
  reason: string;
  kanaIn: string;
  kanaOut: string;
  rulesIn: number;
  rulesOut: number;
}

const r = (reason: string, kanaIn: string, kanaOut: string, rin: RuleName[], rout: RuleName[]): Rule => ({
  reason,
  kanaIn,
  kanaOut,
  rulesIn: bits(rin),
  rulesOut: bits(rout),
});

// Godan column tables: [i-stem kana, a-stem (未然) kana, e-stem kana, o-stem kana, dict ending].
// Used to generate families of rules without repeating every column by hand.
const GODAN: { i: string; a: string; e: string; o: string; dict: string }[] = [
  { i: "い", a: "わ", e: "え", o: "お", dict: "う" },
  { i: "き", a: "か", e: "け", o: "こ", dict: "く" },
  { i: "ぎ", a: "が", e: "げ", o: "ご", dict: "ぐ" },
  { i: "し", a: "さ", e: "せ", o: "そ", dict: "す" },
  { i: "ち", a: "た", e: "て", o: "と", dict: "つ" },
  { i: "に", a: "な", e: "ね", o: "の", dict: "ぬ" },
  { i: "び", a: "ば", e: "べ", o: "ぼ", dict: "ぶ" },
  { i: "み", a: "ま", e: "め", o: "も", dict: "む" },
  { i: "り", a: "ら", e: "れ", o: "ろ", dict: "る" },
];

function buildRules(): Rule[] {
  const rules: Rule[] = [];

  // --- Polite ます family (always outermost → applies on the surface only). ---
  // suffix attaches to the 連用形 (i-stem); deinflect straight to dictionary form.
  const politeSuffixes = ["ます", "ません", "ました", "ませんでした", "ましょう"];
  for (const s of politeSuffixes) {
    rules.push(r("polite", s, "る", [], ["v1"])); // 食べます → 食べる
    rules.push(r("polite", "し" + s, "する", [], ["vs"])); // します → する
    rules.push(r("polite", "き" + s, "くる", [], ["vk"])); // きます → くる
    for (const g of GODAN) rules.push(r("polite", g.i + s, g.dict, [], ["v5"]));
  }

  // --- Past た / だ (surface). ---
  rules.push(r("past", "た", "る", [], ["v1"])); // 食べた → 食べる
  rules.push(r("past", "した", "する", [], ["vs"]));
  rules.push(r("past", "きた", "くる", [], ["vk"]));
  rules.push(r("past", "った", "う", [], ["v5"]));
  rules.push(r("past", "った", "つ", [], ["v5"]));
  rules.push(r("past", "った", "る", [], ["v5"]));
  rules.push(r("past", "った", "く", [], ["v5"])); // 行った → 行く (irregular)
  rules.push(r("past", "いた", "く", [], ["v5"]));
  rules.push(r("past", "いだ", "ぐ", [], ["v5"]));
  rules.push(r("past", "した", "す", [], ["v5"]));
  rules.push(r("past", "んだ", "ぬ", [], ["v5"]));
  rules.push(r("past", "んだ", "ぶ", [], ["v5"]));
  rules.push(r("past", "んだ", "む", [], ["v5"]));
  rules.push(r("past", "かった", "い", [], ["adji"])); // 高かった → 高い

  // --- て / で connective (pseudo `te`; also reachable on the surface). ---
  rules.push(r("-te", "て", "る", ["te"], ["v1"]));
  rules.push(r("-te", "して", "する", ["te"], ["vs"]));
  rules.push(r("-te", "きて", "くる", ["te"], ["vk"]));
  rules.push(r("-te", "って", "う", ["te"], ["v5"]));
  rules.push(r("-te", "って", "つ", ["te"], ["v5"]));
  rules.push(r("-te", "って", "る", ["te"], ["v5"]));
  rules.push(r("-te", "って", "く", ["te"], ["v5"])); // 行って → 行く
  rules.push(r("-te", "いて", "く", ["te"], ["v5"]));
  rules.push(r("-te", "いで", "ぐ", ["te"], ["v5"]));
  rules.push(r("-te", "して", "す", ["te"], ["v5"]));
  rules.push(r("-te", "んで", "ぬ", ["te"], ["v5"]));
  rules.push(r("-te", "んで", "ぶ", ["te"], ["v5"]));
  rules.push(r("-te", "んで", "む", ["te"], ["v5"]));
  rules.push(r("-te", "くて", "い", ["te"], ["adji"])); // 高くて → 高い

  // --- Progressive ている / てる (the て form is itself an ichidan verb). ---
  rules.push(r("progressive", "ている", "て", ["v1"], ["te"]));
  rules.push(r("progressive", "てる", "て", ["v1"], ["te"]));
  rules.push(r("progressive", "でいる", "で", ["v1"], ["te"]));
  rules.push(r("progressive", "でる", "で", ["v1"], ["te"]));

  // --- ～てしまう / ～でしまう (regret / completion): peel しまう back to the
  //     pseudo て-form, then the て rules finish (食べてしまう → 食べて → 食べる). ---
  rules.push(r("-teshimau", "てしまう", "て", [], ["te"]));
  rules.push(r("-teshimau", "でしまう", "で", [], ["te"]));

  // --- Negative ない (conjugates like an い-adjective → rulesIn adji). ---
  rules.push(r("negative", "ない", "る", ["adji"], ["v1"])); // 食べない → 食べる
  rules.push(r("negative", "しない", "する", ["adji"], ["vs"]));
  rules.push(r("negative", "こない", "くる", ["adji"], ["vk"]));
  for (const g of GODAN) rules.push(r("negative", g.a + "ない", g.dict, ["adji"], ["v5"]));
  rules.push(r("negative", "くない", "い", ["adji"], ["adji"])); // 高くない → 高い

  // --- Potential / passive / られる (the result る-form is an ichidan verb). ---
  rules.push(r("potential", "られる", "る", ["v1"], ["v1"])); // 食べられる → 食べる
  rules.push(r("potential", "こられる", "くる", ["v1"], ["vk"]));
  // godan potential: e-stem + る → dict
  for (const g of GODAN) rules.push(r("potential", g.e + "る", g.dict, ["v1"], ["v5"]));
  // godan passive: a-stem + れる → dict
  for (const g of GODAN) rules.push(r("passive", g.a + "れる", g.dict, ["v1"], ["v5"]));
  rules.push(r("passive", "される", "する", ["v1"], ["vs"]));

  // --- Causative させる / せる. ---
  rules.push(r("causative", "させる", "る", ["v1"], ["v1"])); // 食べさせる → 食べる
  rules.push(r("causative", "させる", "する", ["v1"], ["vs"])); // 勉強させる → 勉強する
  for (const g of GODAN) rules.push(r("causative", g.a + "せる", g.dict, ["v1"], ["v5"]));

  // --- Volitional よう / おう (surface). ---
  rules.push(r("volitional", "よう", "る", [], ["v1"]));
  rules.push(r("volitional", "しよう", "する", [], ["vs"]));
  rules.push(r("volitional", "こよう", "くる", [], ["vk"]));
  for (const g of GODAN) rules.push(r("volitional", g.o + "う", g.dict, [], ["v5"]));

  // --- Provisional conditional ば (surface). ---
  rules.push(r("-ba", "れば", "る", [], ["v1"]));
  rules.push(r("-ba", "すれば", "する", [], ["vs"]));
  rules.push(r("-ba", "くれば", "くる", [], ["vk"]));
  rules.push(r("-ba", "ければ", "い", [], ["adji"]));
  for (const g of GODAN) rules.push(r("-ba", g.e + "ば", g.dict, [], ["v5"]));

  // --- Desiderative たい (attaches to i-stem, conjugates like an adjective). ---
  rules.push(r("-tai", "たい", "る", ["adji"], ["v1"]));
  rules.push(r("-tai", "したい", "する", ["adji"], ["vs"]));
  rules.push(r("-tai", "きたい", "くる", ["adji"], ["vk"]));
  for (const g of GODAN) rules.push(r("-tai", g.i + "たい", g.dict, ["adji"], ["v5"]));

  // --- い-adjective adverb (高く → 高い) and noun (高さ → 高い). ---
  rules.push(r("adv", "く", "い", [], ["adji"]));
  rules.push(r("noun", "さ", "い", [], ["adji"]));

  // --- Imperative ろ for ichidan (godan single-kana imperatives omitted to
  //     avoid heavy over-generation). ---
  rules.push(r("imperative", "ろ", "る", [], ["v1"]));

  // --- Derived families (Yomitan covers these too). Each is the same stem as a
  //     family above with a different tail, so we generate them from the base
  //     rules instead of re-listing every euphonic column. ---

  // Conditional ～たら / listing ～たり: the past stem + ら / り
  // (食べたら/食べたり, 飲んだら/飲んだり, 高かったら/高かったり).
  for (const pr of rules.filter((x) => x.reason === "past")) {
    rules.push({ ...pr, reason: "-tara", kanaIn: pr.kanaIn + "ら" });
    rules.push({ ...pr, reason: "-tari", kanaIn: pr.kanaIn + "り" });
  }

  // Casual ～ちゃう / ～じゃう (= ～てしまう / ～でしまう): the て-stem with the
  // connective swapped (食べちゃう→食べる, 飲んじゃう→飲む, 行っちゃう→行く).
  // Skip the adjective て-form (くて → い): ちゃう doesn't attach to adjectives.
  for (const tr of rules.filter((x) => x.reason === "-te" && (x.rulesOut & RULE.adji) === 0)) {
    if (tr.kanaIn.endsWith("て")) {
      rules.push({ ...tr, reason: "-chau", kanaIn: tr.kanaIn.slice(0, -1) + "ちゃう" });
    } else if (tr.kanaIn.endsWith("で")) {
      rules.push({ ...tr, reason: "-chau", kanaIn: tr.kanaIn.slice(0, -1) + "じゃう" });
    }
  }

  // Obligation ～なきゃ / ～なくちゃ (= ～なければ / ～なくては): the negative stem
  // with ない swapped (食べなきゃ, 飲まなきゃ, しなきゃ, 高くなきゃ).
  for (const nr of rules.filter((x) => x.reason === "negative" && x.kanaIn.endsWith("ない"))) {
    const stem = nr.kanaIn.slice(0, -2);
    rules.push({ ...nr, reason: "-nakya", kanaIn: stem + "なきゃ" });
    rules.push({ ...nr, reason: "-nakya", kanaIn: stem + "なくちゃ" });
  }

  return rules;
}

const RULES = buildRules();

export interface Deinflection {
  /** Candidate dictionary form. */
  term: string;
  /** Inflection reasons, surface-first (e.g. ["polite","causative"]). */
  reasons: string[];
  /** Word-type bit flags the candidate must be compatible with (0 = any). */
  rules: number;
}

const MAX_RESULTS = 256;

/**
 * Walk an inflected Japanese term back to candidate dictionary forms. The first
 * result is always the identity (the input itself, for an exact match).
 */
export function deinflect(source: string): Deinflection[] {
  const results: Deinflection[] = [{ term: source, reasons: [], rules: 0 }];
  const seen = new Set<string>([source + "|0"]);

  for (let i = 0; i < results.length && results.length < MAX_RESULTS; i++) {
    const { term, rules, reasons } = results[i];
    for (const rule of RULES) {
      if (rules !== 0 && (rules & rule.rulesIn) === 0) continue;
      if (!term.endsWith(rule.kanaIn)) continue;
      const stem = term.length - rule.kanaIn.length;
      if (stem + rule.kanaOut.length <= 0) continue;
      const next = term.substring(0, stem) + rule.kanaOut;
      const key = next + "|" + rule.rulesOut;
      if (seen.has(key)) continue;
      seen.add(key);
      // Surface-first order: stripping happens from the outer suffix inward, so
      // the reason just applied is appended (reasons read outermost → innermost).
      results.push({ term: next, reasons: [...reasons, rule.reason], rules: rule.rulesOut });
    }
  }
  return results;
}

/** Parse a Yomitan term `rules` string ("v5k vt", "adj-i", …) into our flags. */
export function parseEntryRules(rules: string | undefined): number {
  if (!rules) return 0;
  let b = 0;
  for (const token of rules.split(/\s+/)) {
    if (token === "v1" || token.startsWith("v1")) b |= RULE.v1;
    else if (token.startsWith("v5")) b |= RULE.v5;
    else if (token.startsWith("vk")) b |= RULE.vk;
    else if (token.startsWith("vs") || token === "vz") b |= RULE.vs;
    else if (token.startsWith("adj-i")) b |= RULE.adji;
  }
  return b;
}

/**
 * Whether a deinflection candidate is grammatically valid for a dictionary
 * entry. Lenient: an entry with no/unknown rule tags is always accepted so we
 * never hide a real match just because the source dictionary lacked metadata.
 */
export function rulesMatchEntry(candidateRules: number, entryRules: string | undefined): boolean {
  if (candidateRules === 0) return true; // identity / unconstrained
  const eb = parseEntryRules(entryRules);
  if (eb === 0) return true; // unknown word-type → don't filter
  return (candidateRules & eb) !== 0;
}

// ---------------------------------------------------------------------------
// Light English deinflection (plural / past / -ing / comparative). Yomitan
// ships English transforms too; this is a small, useful subset.
// ---------------------------------------------------------------------------
export function deinflectEnglish(source: string): Deinflection[] {
  const lower = source.toLowerCase();
  const out: Deinflection[] = [{ term: lower, reasons: [], rules: 0 }];
  const seen = new Set([lower]);
  const add = (term: string, reason: string) => {
    if (term.length < 2 || seen.has(term)) return;
    seen.add(term);
    out.push({ term, reasons: [reason], rules: 0 });
  };

  if (lower.endsWith("ies")) add(lower.slice(0, -3) + "y", "plural");
  if (lower.endsWith("es")) add(lower.slice(0, -2), "plural");
  if (lower.endsWith("s")) add(lower.slice(0, -1), "plural");
  if (lower.endsWith("ied")) add(lower.slice(0, -3) + "y", "past");
  if (lower.endsWith("ed")) {
    add(lower.slice(0, -2), "past");
    add(lower.slice(0, -1), "past"); // liked → like
  }
  if (lower.endsWith("ing")) {
    add(lower.slice(0, -3), "-ing");
    add(lower.slice(0, -3) + "e", "-ing"); // making → make
  }
  if (lower.endsWith("er")) add(lower.slice(0, -2), "comparative");
  if (lower.endsWith("est")) add(lower.slice(0, -3), "superlative");
  // doubled final consonant: stopped → stop, running → run
  const m = /(.*?)([bcdfgklmnprstvz])\2(ed|ing)$/.exec(lower);
  if (m) add(m[1] + m[2], m[3] === "ed" ? "past" : "-ing");
  return out;
}

/**
 * Generate look-up candidates for a query in a given source language: the
 * Japanese deinflector, the light English deinflector, or just the identity.
 * For Japanese we also accept romaji input ("sakura", "tabeta") by converting
 * it to kana and deinflecting that too, so typing a reading finds the entry.
 */
export function candidates(text: string, lang: string): Deinflection[] {
  const q = text.trim();
  if (!q) return [];
  if (lang === "ja") {
    const out = deinflect(q);
    const kana = romajiToHiragana(q);
    if (kana && kana !== q) {
      const seen = new Set(out.map((d) => d.term + "|" + d.rules));
      for (const d of deinflect(kana)) {
        const key = d.term + "|" + d.rules;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(d);
        }
      }
    }
    return out;
  }
  if (lang === "en") return deinflectEnglish(q);
  return [{ term: q, reasons: [], rules: 0 }];
}

/** Human-readable (Vietnamese) labels for inflection reasons, for the UI. */
export const REASON_LABELS: Record<string, string> = {
  polite: "thể lịch sự (ます)",
  past: "quá khứ",
  "-te": "thể て",
  negative: "phủ định",
  potential: "khả năng",
  passive: "bị động",
  causative: "sai khiến",
  volitional: "ý chí (～よう)",
  "-ba": "điều kiện (～ば)",
  "-tara": "điều kiện (～たら)",
  "-tari": "liệt kê (～たり)",
  "-chau": "lỡ/hoàn tất (～ちゃう)",
  "-teshimau": "lỡ/hoàn tất (～てしまう)",
  "-nakya": "bắt buộc (～なきゃ)",
  "-tai": "mong muốn (～たい)",
  progressive: "tiếp diễn (～ている)",
  adv: "trạng từ",
  noun: "danh từ hoá",
  imperative: "mệnh lệnh",
  plural: "số nhiều",
  "past ": "quá khứ",
  "-ing": "danh động từ (-ing)",
  comparative: "so sánh hơn",
  superlative: "so sánh nhất",
};

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}
