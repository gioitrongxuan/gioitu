// Romaji → hiragana, so typing a Japanese word's reading in the Latin alphabet
// ("sakura", "taberu") finds the kana/kanji entry ("さくら" → 桜, "たべる" → 食べる).
// Hepburn-ish and deliberately small: enough to map everyday input, returning ""
// when the text isn't clean romaji so callers can simply skip it.

// Longest-first so digraphs (kya, sha, tsu) win over their prefixes.
const ROMAJI: Record<string, string> = {
  kya: "きゃ", kyu: "きゅ", kyo: "きょ", sha: "しゃ", shu: "しゅ", sho: "しょ",
  cha: "ちゃ", chu: "ちゅ", cho: "ちょ", nya: "にゃ", nyu: "にゅ", nyo: "にょ",
  hya: "ひゃ", hyu: "ひゅ", hyo: "ひょ", mya: "みゃ", myu: "みゅ", myo: "みょ",
  rya: "りゃ", ryu: "りゅ", ryo: "りょ", gya: "ぎゃ", gyu: "ぎゅ", gyo: "ぎょ",
  ja: "じゃ", ju: "じゅ", jo: "じょ", bya: "びゃ", byu: "びゅ", byo: "びょ",
  pya: "ぴゃ", pyu: "ぴゅ", pyo: "ぴょ",
  shi: "し", chi: "ち", tsu: "つ",
  ka: "か", ki: "き", ku: "く", ke: "け", ko: "こ",
  sa: "さ", si: "し", su: "す", se: "せ", so: "そ",
  ta: "た", ti: "ち", tu: "つ", te: "て", to: "と",
  na: "な", ni: "に", nu: "ぬ", ne: "ね", no: "の",
  ha: "は", hi: "ひ", fu: "ふ", hu: "ふ", he: "へ", ho: "ほ",
  ma: "ま", mi: "み", mu: "む", me: "め", mo: "も",
  ya: "や", yu: "ゆ", yo: "よ",
  ra: "ら", ri: "り", ru: "る", re: "れ", ro: "ろ",
  wa: "わ", wo: "を", wi: "うぃ", we: "うぇ",
  ga: "が", gi: "ぎ", gu: "ぐ", ge: "げ", go: "ご",
  za: "ざ", ji: "じ", zi: "じ", zu: "ず", ze: "ぜ", zo: "ぞ",
  da: "だ", di: "ぢ", du: "づ", de: "で", do: "ど",
  ba: "ば", bi: "び", bu: "ぶ", be: "べ", bo: "ぼ",
  pa: "ぱ", pi: "ぴ", pu: "ぷ", pe: "ぺ", po: "ぽ",
  a: "あ", i: "い", u: "う", e: "え", o: "お",
};

const MAX_KEY = 3; // longest romaji key length

/**
 * Convert clean romaji to hiragana. Returns "" if the input isn't usable romaji
 * (contains kana/kanji, or a fragment we can't map) so callers skip conversion
 * rather than feed a half-translated string into look-up.
 */
export function romajiToHiragana(input: string): string {
  const s = input.trim().toLowerCase();
  if (!s || !/^[a-z]+$/.test(s)) return "";

  let out = "";
  let i = 0;
  while (i < s.length) {
    // Sokuon: a doubled consonant (kk, tt, ss…) — or "tc" as in "matcha" (まっちゃ)
    // — becomes っ + the rest.
    const doubled =
      i + 1 < s.length && s[i] === s[i + 1] && s[i] !== "n" && !"aiueo".includes(s[i]);
    const tch = s[i] === "t" && s[i + 1] === "c";
    if (doubled || tch) {
      out += "っ";
      i++;
      continue;
    }
    // Syllabic ん: "n" not starting a syllable (followed by a consonant or end).
    if (s[i] === "n" && (i + 1 >= s.length || !"aiueoy".includes(s[i + 1]))) {
      out += "ん";
      i++;
      continue;
    }
    let matched = false;
    for (let len = Math.min(MAX_KEY, s.length - i); len >= 1; len--) {
      const kana = ROMAJI[s.slice(i, i + len)];
      if (kana) {
        out += kana;
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) return ""; // unmappable fragment → not clean romaji
  }
  return out;
}
