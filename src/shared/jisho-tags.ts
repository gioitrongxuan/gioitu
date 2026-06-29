// Bộ từ vựng tag — port nguyên từ ref/jisho-open (common/src/api/word.ts & index.ts).
// Đây là "hệ trường" phân loại của jisho mà ta kế thừa: part-of-speech, misc,
// field/domain, dialect, ngôn ngữ nguồn, kiểu gloss, pitch accent, JLPT, commonness.
// Nhãn hiển thị + màu cho từng mã được resolve riêng ở dictionary/domain/tags.ts.

// --- Part of speech (JMdict) ---
export const partOfSpeechTags = [
  "adj-f", "adj-i", "adj-ix", "adj-kari", "adj-ku", "adj-na", "adj-nari", "adj-no",
  "adj-pn", "adj-shiku", "adj-t", "adv", "adv-to", "aux", "aux-adj", "aux-v",
  "conj", "cop", "ctr", "exp", "int", "n", "n-adv", "n-pr", "n-pref", "n-suf",
  "n-t", "num", "pn", "pref", "prt", "suf", "unc", "v-unspec", "v1", "v1-s",
  "v2a-s", "v2b-k", "v2b-s", "v2d-k", "v2d-s", "v2g-k", "v2g-s", "v2h-k", "v2h-s",
  "v2k-k", "v2k-s", "v2m-k", "v2m-s", "v2n-s", "v2r-k", "v2r-s", "v2s-s", "v2t-k",
  "v2t-s", "v2w-s", "v2y-k", "v2y-s", "v2z-s", "v4b", "v4g", "v4h", "v4k", "v4m",
  "v4n", "v4r", "v4s", "v4t", "v5aru", "v5b", "v5g", "v5k", "v5k-s", "v5m", "v5n",
  "v5r", "v5r-i", "v5s", "v5t", "v5u", "v5u-s", "v5uru", "vi", "vk", "vn", "vr",
  "vs", "vs-c", "vs-i", "vs-s", "vt", "vz",
] as const;

/** Mã POS gộp/suy ra mà jisho tự đặt (không thuộc JMdict gốc). */
export const partOfSpeechCustomTags = [
  "adj", "v", "v2", "v2-k", "v2-s", "v4", "v5", "vmasu", "vmasuneg", "virr",
  "v1contr", "vte",
] as const;

/** Mã loại tên riêng (ENAMDICT). */
export const partOfSpeechNameTags = [
  "char", "company", "creat", "dei", "doc", "ev", "fem", "fict", "given", "group",
  "leg", "masc", "myth", "obj", "organization", "oth", "person", "place", "product",
  "relig", "serv", "ship", "station", "surname", "unclass", "work",
] as const;

export type PartOfSpeechTag =
  | (typeof partOfSpeechTags)[number]
  | (typeof partOfSpeechCustomTags)[number]
  | (typeof partOfSpeechNameTags)[number];

export type LanguageTag =
  | "eng" | "afr" | "ain" | "alg" | "amh" | "ara" | "arn" | "bnt" | "bre" | "bul"
  | "bur" | "chi" | "chn" | "cze" | "dan" | "dut" | "epo" | "est" | "fil" | "fin"
  | "fre" | "geo" | "ger" | "glg" | "grc" | "gre" | "haw" | "heb" | "hin" | "hun"
  | "ice" | "ind" | "ita" | "khm" | "kor" | "kur" | "lat" | "lit" | "mal" | "mao"
  | "mas" | "may" | "mnc" | "mol" | "mon" | "nor" | "per" | "pol" | "por" | "rum"
  | "rus" | "san" | "scr" | "slo" | "slv" | "som" | "spa" | "swa" | "swe" | "tah"
  | "tam" | "tgl" | "tha" | "tib" | "tur" | "ukr" | "urd" | "vie" | "yid";

export type MiscTag =
  | "abbr" | "aphorism" | "arch" | "char" | "chn" | "col" | "company" | "creat"
  | "dated" | "dei" | "derog" | "doc" | "euph" | "ev" | "fam" | "fem" | "fict"
  | "form" | "given" | "group" | "hist" | "hon" | "hum" | "id" | "joc" | "leg"
  | "m-sl" | "male" | "myth" | "net-sl" | "obj" | "obs" | "on-mim" | "organization"
  | "oth" | "person" | "place" | "poet" | "pol" | "product" | "proverb" | "quote"
  | "rare" | "relig" | "sens" | "serv" | "ship" | "sl" | "station" | "surname"
  | "uk" | "unclass" | "vulg" | "work" | "X" | "yoji";

export type FieldDomainTag =
  | "agric" | "anat" | "archeol" | "archit" | "art" | "astron" | "audvid" | "aviat"
  | "baseb" | "biochem" | "biol" | "bot" | "Buddh" | "bus" | "cards" | "chem"
  | "Christn" | "cloth" | "comp" | "cryst" | "dent" | "ecol" | "econ" | "elec"
  | "electr" | "embryo" | "engr" | "ent" | "film" | "finc" | "fish" | "food"
  | "gardn" | "genet" | "geogr" | "geol" | "geom" | "go" | "golf" | "gramm"
  | "grmyth" | "hanaf" | "horse" | "kabuki" | "law" | "ling" | "logic" | "MA"
  | "mahj" | "manga" | "math" | "mech" | "med" | "met" | "mil" | "mining" | "music"
  | "noh" | "ornith" | "paleo" | "pathol" | "pharm" | "phil" | "photo" | "physics"
  | "physiol" | "politics" | "print" | "psy" | "psyanal" | "psych" | "rail"
  | "rommyth" | "Shinto" | "shogi" | "ski" | "sports" | "stat" | "stockm" | "sumo"
  | "telec" | "tradem" | "tv" | "vidg" | "zool";

export type DialectTag =
  | "bra" | "hob" | "ksb" | "ktb" | "kyb" | "kyu" | "nab" | "osb" | "rkb" | "std"
  | "thb" | "tsb" | "tsug";

export type GlossTypeTag = "equ" | "expl" | "fig" | "lit" | "tm";

export type PitchAccentTag = "atamadaka" | "nakadaka" | "odaka" | "heiban";

// --- Commonness / JLPT / Jōyō (index.ts) ---
export type CommonnessTag = "veryCommon" | "common";
export type CommonnessIndex = 2 | 1;
export type JlptTag = "jlpt" | "n5" | "n4" | "n3" | "n2" | "n1";
export type JlptLevel = 5 | 4 | 3 | 2 | 1;
export type JouyouGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7;
