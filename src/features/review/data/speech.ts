// Bọc Web Speech API cho chế độ nghe — lớp I/O duy nhất chạm `speechSynthesis`.
// `domain/listen` chỉ mô tả *đọc gì*; ở đây mới thực sự phát ra tiếng.

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
