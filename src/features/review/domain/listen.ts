// Chế độ nghe: phát âm thanh chạy liên tục qua các từ đang học, để ôn được lúc
// không nhìn màn hình. Thuần — chỉ dựng danh sách phát và nở một từ thành chuỗi
// lời đọc; việc phát tiếng thật (Web Speech API) nằm ở `data/speech`.
//
// Không chấm điểm, không ghi gì: chế độ này chỉ đọc dữ liệu ra loa.

import { VocabEntry } from "@/shared/types";
import { meaningToLines } from "@/shared/meaning";
import { CloudLang, filterByLang, isVisibleOnCloud } from "./wordcloud";
import { shuffle } from "./session";

/** Đọc quá vài nghĩa thì lời đọc dài lê thê và mất nhịp ôn. */
const MAX_MEANING_LINES = 2;

/** Nghe từ hai lần rồi mới tới nghĩa — quen âm trước, nhớ nghĩa sau. */
const TERM_REPEATS = 2;

const SPEECH_LOCALES: Record<string, string> = {
  ja: "ja-JP",
  en: "en-US",
  vi: "vi-VN",
};

/** Locale giọng đọc của một mã ngôn ngữ; mã lạ trả về chính nó cho trình duyệt tự xử. */
export function speechLocale(lang: string): string {
  return SPEECH_LOCALES[lang] ?? lang;
}

/** Một số hệ điều hành báo thẻ ngôn ngữ dạng `ja_JP` thay vì `ja-JP`. */
const normalizeLang = (lang: string) => lang.toLowerCase().replace("_", "-");

/**
 * Giọng khớp locale: ưu tiên khớp đủ, không có thì khớp theo gốc ngôn ngữ —
 * giọng chỉ khai mỗi "vi" vẫn đọc được "vi-VN".
 */
export function findVoice<V extends { lang: string }>(voices: V[], locale: string): V | undefined {
  const wanted = normalizeLang(locale);
  const base = wanted.split("-")[0];
  return (
    voices.find((voice) => normalizeLang(voice.lang) === wanted) ??
    voices.find((voice) => normalizeLang(voice.lang).split("-")[0] === base)
  );
}

/** Một bước trong lời đọc: đọc một đoạn, hoặc im lặng chờ. */
export type ListenStep =
  | { kind: "speak"; text: string; locale: string }
  | { kind: "pause"; ms: number };

type TermSide = Pick<VocabEntry, "term" | "term_lang"> & Partial<Pick<VocabEntry, "reading">>;

export type ListenCard = TermSide & Pick<VocabEntry, "native_lang" | "meaning">;

/**
 * Mặt chữ đem đi đọc. Kanji đứng một mình có nhiều âm nên máy hay đọc sai — có
 * kana thì đọc kana.
 */
export function speakableTerm(card: TermSide): string {
  if (card.term_lang === "ja" && card.reading) return card.reading;
  return card.term;
}

/** Nghĩa đem đi đọc: vài dòng đầu nối lại; rỗng nếu payload trống hoặc hỏng. */
export function speakableMeaning(meaning: string): string {
  return meaningToLines(meaning).slice(0, MAX_MEANING_LINES).join(", ");
}

/** Nở một từ thành chuỗi bước: từ (×2) → lặng để tự nhớ lại → nghĩa. */
export function cardSteps(card: ListenCard, gapMs: number): ListenStep[] {
  const term: ListenStep = {
    kind: "speak",
    text: speakableTerm(card),
    locale: speechLocale(card.term_lang),
  };
  return [
    ...Array.from({ length: TERM_REPEATS }, () => term),
    { kind: "pause", ms: gapMs },
    { kind: "speak", text: speakableMeaning(card.meaning), locale: speechLocale(card.native_lang) },
  ];
}

/**
 * Từ nghe được: đang học (đúng tập trên Bản đồ từ), thuộc ngôn ngữ đang chọn,
 * và có nghĩa đọc được. Tách khỏi `buildListenPlaylist` để nơi chỉ cần *đếm*
 * (nút "Nghe") không phải xáo trộn cả danh sách mỗi lần render.
 */
export function listenableEntries(entries: VocabEntry[], lang: CloudLang): VocabEntry[] {
  return filterByLang(entries.filter(isVisibleOnCloud), lang).filter(
    (entry) => speakableMeaning(entry.meaning) !== "",
  );
}

/**
 * Danh sách phát: các từ nghe được, xáo trộn. Gọi lại với `rng` mới để sang
 * vòng kế — thứ tự khác nhau nên không thuộc lòng theo thứ tự.
 */
export function buildListenPlaylist(
  entries: VocabEntry[],
  lang: CloudLang,
  rng: () => number = Math.random,
): VocabEntry[] {
  return shuffle(listenableEntries(entries, lang), rng);
}
