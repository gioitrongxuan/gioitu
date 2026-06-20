// Japanese furigana distribution — a faithful port of Yomitan's algorithm
// (ext/js/language/ja/japanese.js: distributeFurigana / segmentizeFurigana).
//
// The naive "trim a common kana prefix/suffix" approach mis-renders any word
// with okurigana *between* kanji (食べ物, 取り消す, 待ち合わせ): it lumps the
// whole middle into one ruby. Yomitan instead splits the term into kana/kanji
// runs and recursively aligns the reading against them, so each kanji run gets
// exactly its share of the reading and embedded kana stays bare:
//   食べ物 / たべもの → 食(た)べ物(もの)   (not 食べ物(たべもの))
//
// Readings are normalised katakana→hiragana before matching so a katakana
// reading still aligns to a hiragana okurigana (and vice-versa).

const KATAKANA_SMALL_KA = 0x30f5;
const KATAKANA_SMALL_KE = 0x30f6;
const PROLONGED_SOUND_MARK = 0x30fc;

const HIRAGANA_RANGE: [number, number] = [0x3040, 0x309f];
const KATAKANA_RANGE: [number, number] = [0x30a0, 0x30ff];
const HIRAGANA_CONVERSION_START = 0x3041;
const KATAKANA_CONVERSION_RANGE: [number, number] = [0x30a1, 0x30f6];

const CJK_IDEOGRAPH_RANGES: [number, number][] = [
  [0x3400, 0x4dbf], // CJK unified ideographs extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0x20000, 0x2ffff], // CJK unified ideographs extensions B–F (supplementary)
];

function inRange(cp: number, [lo, hi]: [number, number]): boolean {
  return cp >= lo && cp <= hi;
}

function inRanges(cp: number, ranges: [number, number][]): boolean {
  for (const r of ranges) if (inRange(cp, r)) return true;
  return false;
}

/** One furigana segment: base text with an optional reading above it. */
export interface FuriganaSegment {
  text: string;
  /** Absent when the segment is bare (kana / no ruby needed). */
  reading?: string;
}

export function isCodePointKana(cp: number): boolean {
  return inRange(cp, HIRAGANA_RANGE) || inRange(cp, KATAKANA_RANGE);
}

export function isCodePointKanji(cp: number): boolean {
  return inRanges(cp, CJK_IDEOGRAPH_RANGES);
}

/** Whether the string contains at least one Japanese (kana/kanji) character. */
export function isStringPartiallyJapanese(str: string): boolean {
  for (const c of str) {
    const cp = c.codePointAt(0) ?? 0;
    if (isCodePointKana(cp) || isCodePointKanji(cp)) return true;
  }
  return false;
}

/** Vowel a prolonged-sound-mark (ー) lengthens, for katakana→hiragana mapping. */
const VOWEL_OF = new Map<string, "a" | "i" | "u" | "e" | "o">();
for (const [v, chars] of [
  ["a", "ぁあかがさざただなはばぱまゃやらゎわ"],
  ["i", "ぃいきぎしじちぢにひびぴみり"],
  ["u", "ぅうくぐすずっつづぬふぶぷむゅゆる"],
  ["e", "ぇえけげせぜてでねへべぺめれ"],
  ["o", "ぉおこごそぞとどのほぼぽもょよろを"],
] as const) {
  for (const ch of chars) VOWEL_OF.set(ch, v);
}

function prolongedHiragana(prev: string): string | null {
  switch (VOWEL_OF.get(prev)) {
    case "a": return "あ";
    case "i": return "い";
    case "u": return "う";
    case "e": return "え";
    case "o": return "う";
    default: return null;
  }
}

/**
 * Normalise katakana to hiragana so readings written in either kana align.
 * Mirrors Yomitan's convertKatakanaToHiragana (prolonged marks resolve to the
 * matching vowel; small ヵ/ヶ are left as-is).
 */
export function katakanaToHiragana(text: string): string {
  let result = "";
  const offset = HIRAGANA_CONVERSION_START - KATAKANA_CONVERSION_RANGE[0];
  for (let char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp === KATAKANA_SMALL_KA || cp === KATAKANA_SMALL_KE) {
      // no change
    } else if (cp === PROLONGED_SOUND_MARK) {
      if (result.length > 0) {
        const replacement = prolongedHiragana(result[result.length - 1]);
        if (replacement !== null) char = replacement;
      }
    } else if (inRange(cp, KATAKANA_CONVERSION_RANGE)) {
      char = String.fromCodePoint(cp + offset);
    }
    result += char;
  }
  return result;
}

interface Group {
  isKana: boolean;
  text: string;
  textNormalized: string | null;
}

function seg(text: string, reading: string): FuriganaSegment {
  return { text, reading };
}

/**
 * Split a kana run that partially echoes the reading: where the reading equals
 * the text the chars stay bare, elsewhere they take the reading. (Rare, but
 * Yomitan handles it; keeps katakana-in-term readings correct.)
 */
function furiganaKanaSegments(text: string, reading: string): FuriganaSegment[] {
  const out: FuriganaSegment[] = [];
  let start = 0;
  let state = reading[0] === text[0];
  for (let i = 1; i < text.length; i++) {
    const next = reading[i] === text[i];
    if (state === next) continue;
    out.push(seg(text.substring(start, i), state ? "" : reading.substring(start, i)));
    state = next;
    start = i;
  }
  out.push(seg(text.substring(start), state ? "" : reading.substring(start)));
  return out;
}

function segmentize(
  reading: string,
  readingNormalized: string,
  groups: Group[],
  groupsStart: number,
): FuriganaSegment[] | null {
  const groupCount = groups.length - groupsStart;
  if (groupCount <= 0) return reading.length === 0 ? [] : null;

  const group = groups[groupsStart];
  const { isKana, text } = group;
  const textLength = text.length;

  if (isKana) {
    const { textNormalized } = group;
    if (textNormalized !== null && readingNormalized.startsWith(textNormalized)) {
      const rest = segmentize(
        reading.substring(textLength),
        readingNormalized.substring(textLength),
        groups,
        groupsStart + 1,
      );
      if (rest !== null) {
        if (reading.startsWith(text)) rest.unshift(seg(text, ""));
        else rest.unshift(...furiganaKanaSegments(text, reading));
        return rest;
      }
    }
    return null;
  }

  // Kanji run: try every split point of the reading; the assignment must be
  // unambiguous (more than one valid tail split → bail to the caller).
  let result: FuriganaSegment[] | null = null;
  for (let i = reading.length; i >= textLength; --i) {
    const rest = segmentize(
      reading.substring(i),
      readingNormalized.substring(i),
      groups,
      groupsStart + 1,
    );
    if (rest !== null) {
      if (result !== null) return null; // ambiguous
      rest.unshift(seg(text, reading.substring(0, i)));
      result = rest;
    }
    if (groupCount === 1) break; // only one way to split the final kanji run
  }
  return result;
}

/**
 * Distribute a whole-word reading across a mixed kanji/kana term so okurigana
 * stays bare and each kanji run gets its own ruby. Falls back to a single ruby
 * over the whole term when the reading can't be aligned unambiguously.
 *
 * Segments whose reading would be empty omit the `reading` key entirely, so the
 * UI renders them as plain text.
 */
export function distributeFurigana(term: string, reading?: string): FuriganaSegment[] {
  if (!reading || reading === term) return [{ text: term }];

  const groups: Group[] = [];
  let isKanaPrev: boolean | null = null;
  for (const c of term) {
    const isKana = isCodePointKana(c.codePointAt(0) ?? 0);
    if (isKana === isKanaPrev) {
      groups[groups.length - 1].text += c;
    } else {
      groups.push({ isKana, text: c, textNormalized: null });
      isKanaPrev = isKana;
    }
  }
  for (const g of groups) if (g.isKana) g.textNormalized = katakanaToHiragana(g.text);

  const segments = segmentize(reading, katakanaToHiragana(reading), groups, 0) ?? [
    seg(term, reading),
  ];
  // Normalise empty readings to `undefined` so the UI omits the ruby.
  return segments.map((s) => (s.reading ? s : { text: s.text }));
}
