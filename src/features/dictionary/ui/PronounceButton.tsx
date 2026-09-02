// Nút phát âm một mục từ trong từ điển (#246): tra xong nghe được ngay chữ đó
// đọc thế nào, không phải mở chế độ nghe (vốn chỉ chạy trên từ đang học).
//
// Giọng lấy từ máy người dùng (Web Speech API) nên không tốn mạng và chạy được
// offline; máy không có gói giọng cho ngôn ngữ đó thì báo bằng toast chứ không
// im lặng như vừa phát xong.

import { useEffect, useRef, useState } from "react";
import {
  cancelSpeech,
  findVoice,
  isSpeechSupported,
  loadVoices,
  speak,
  speakableTerm,
  speechLocale,
} from "@/shared/speech";
import { pushToast } from "@/shared/ui/Toasts";
import { SpeakerIcon } from "@/shared/ui/icons";
import "./pronounce.css";

/** Mỗi lượt chỉ đọc một từ, nên đọc chậm hơn chế độ nghe một chút để bắt kịp âm. */
const PRONOUNCE_RATE = 0.9;

interface Props {
  term: string;
  /** Cách đọc (kana) nếu từ điển có — kanji đứng một mình dễ bị đọc sai âm. */
  reading?: string | null;
  /** Ngôn ngữ của từ (term_lang), quyết định locale giọng đọc. */
  lang: string;
}

export function PronounceButton({ term, reading, lang }: Props) {
  const [speaking, setSpeaking] = useState(false);
  // Ref theo state để cleanup lúc unmount biết có đang đọc dở hay không: đóng
  // panel giữa chừng mà không cắt thì giọng vẫn đọc nốt dù từ đã biến mất.
  const speakingRef = useRef(false);
  speakingRef.current = speaking;
  // Đánh số lượt đọc: lượt cũ bị dừng vẫn resolve muộn (chốt chặn thời gian của
  // `speak` có thể tới sau vài giây), không đánh số thì nó tắt trạng thái của
  // lượt mới và nút lại cho bấm chồng lượt nữa.
  const runRef = useRef(0);
  useEffect(
    () => () => {
      if (speakingRef.current) cancelSpeech();
    },
    [],
  );

  // Trình duyệt không có Web Speech: ẩn hẳn nút, đừng để một nút bấm không kêu.
  if (!isSpeechSupported()) return null;

  const text = speakableTerm({ term, term_lang: lang, reading });
  if (text === "") return null;

  const label = speaking ? "Dừng phát âm" : "Nghe phát âm";

  async function pronounce() {
    // Bấm lần nữa lúc đang đọc = dừng, thay vì xếp thêm một lượt đọc chồng lên.
    if (speakingRef.current) {
      runRef.current += 1;
      cancelSpeech();
      setSpeaking(false);
      return;
    }
    const run = (runRef.current += 1);
    setSpeaking(true);
    const locale = speechLocale(lang);
    const voices = await loadVoices();
    // Bấm dừng trong lúc còn chờ danh sách giọng: bỏ luôn lượt này, đừng để
    // tiếng phát ra sau khi người dùng đã tắt.
    if (runRef.current !== run) return;
    const voice = findVoice(voices, locale);
    // Danh sách rỗng nghĩa là máy chưa trả giọng nào (chưa hẳn là thiếu) — chỉ
    // cảnh báo khi biết chắc có giọng nhưng không giọng nào hợp ngôn ngữ này.
    if (voices.length > 0 && !voice) {
      pushToast(
        "Máy chưa có giọng đọc cho ngôn ngữ này — cài thêm gói giọng trong cài đặt hệ thống.",
        "warn",
      );
    }
    await speak(text, { locale, rate: PRONOUNCE_RATE, voice });
    if (runRef.current === run) setSpeaking(false);
  }

  return (
    <button
      type="button"
      className={`pronounce-btn${speaking ? " speaking" : ""}`}
      title={label}
      aria-label={label}
      onClick={pronounce}
    >
      <SpeakerIcon size={16} />
    </button>
  );
}
