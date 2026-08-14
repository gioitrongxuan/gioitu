// Giọng đọc dùng chung (Web Speech API). Trước đây phần này nằm trong feature
// `review` (chế độ nghe) vì chỉ có một nơi dùng; từ khi từ điển cũng phát âm
// được (#246) nó thành hạ tầng chung: đây là lớp DUY NHẤT chạm `speechSynthesis`,
// kèm mấy hàm thuần chọn locale/giọng/mặt chữ đem đi đọc.

/**
 * Chrome trả danh sách giọng RỖNG ở lần gọi đầu rồi mới bắn `voiceschanged`.
 * Chờ sự kiện đó, nhưng không chờ mãi: máy thật sự không có giọng nào thì vẫn
 * phải trả lời để UI kịp cảnh báo thay vì treo màn chờ.
 */
const VOICES_TIMEOUT_MS = 3000;

/**
 * Chrome có bug lâu năm: câu dài bị cắt giữa chừng và `onend` không bao giờ
 * bắn, treo cả chuỗi phát. Chặn trên nới theo độ dài chữ để chuỗi luôn đi tiếp.
 */
const SPEAK_TIMEOUT_BASE_MS = 5000;
const SPEAK_TIMEOUT_PER_CHAR_MS = 150;

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

/** Từ đem đi đọc: chỉ cần mặt chữ + ngôn ngữ, cách đọc thì tuỳ có hay không. */
export interface SpeakableTerm {
  term: string;
  term_lang: string;
  reading?: string | null;
}

/**
 * Mặt chữ đem đi đọc. Kanji đứng một mình có nhiều âm nên máy hay đọc sai — có
 * kana thì đọc kana.
 */
export function speakableTerm(card: SpeakableTerm): string {
  if (card.term_lang === "ja" && card.reading) return card.reading;
  return card.term;
}

export const isSpeechSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window;

/** Danh sách giọng của máy, đã chờ `voiceschanged` nếu lần gọi đầu còn rỗng. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSupported()) return Promise.resolve([]);
  const ready = window.speechSynthesis.getVoices();
  if (ready.length > 0) return Promise.resolve(ready);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      resolve(window.speechSynthesis.getVoices());
    };
    const timer = setTimeout(finish, VOICES_TIMEOUT_MS);
    window.speechSynthesis.addEventListener("voiceschanged", finish);
  });
}

export function cancelSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}

export interface SpeakOptions {
  locale: string;
  rate: number;
  voice?: SpeechSynthesisVoice;
}

/**
 * Đọc một đoạn, resolve khi đọc xong. Không bao giờ reject: lỗi giọng hay bị
 * `cancel()` giữa chừng đều là chuyện thường của một phiên nghe, và chuỗi phát
 * phải đi tiếp được thay vì đứt.
 */
export function speak(text: string, options: SpeakOptions): Promise<void> {
  if (!isSpeechSupported() || text === "") return Promise.resolve();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.locale;
    utterance.rate = options.rate;
    if (options.voice) utterance.voice = options.voice;

    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    timer = setTimeout(finish, SPEAK_TIMEOUT_BASE_MS + text.length * SPEAK_TIMEOUT_PER_CHAR_MS);

    window.speechSynthesis.speak(utterance);
  });
}
