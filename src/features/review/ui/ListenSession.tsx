// Chế độ nghe: phát liên tục các từ đang học để ôn lúc không nhìn màn hình.
// Không chấm điểm, không ghi gì — chỉ đọc ra loa (xem docs/FEATURES.md).
//
// Vòng phát nằm trong một effect khoá theo (đang phát, thẻ, bước): mỗi lần chạy
// làm đúng MỘT bước rồi tự chuyển bước kế. Nhờ vậy tạm dừng / bấm từ trước-sau /
// đóng phiên đều chỉ là đổi state — cleanup của effect lo việc cắt tiếng.

import { useEffect, useMemo, useRef, useState } from "react";
import { VocabEntry } from "@/shared/types";
import { meaningToLines } from "@/shared/meaning";
import { CloudLang } from "../domain/wordcloud";
import { buildListenPlaylist, cardSteps } from "../domain/listen";
import {
  LISTEN_GAPS_MS,
  LISTEN_RATES,
  loadListenSettings,
  saveListenSettings,
  type ListenSettings,
} from "../domain/listenSettings";
import {
  cancelSpeech,
  findVoice,
  isSpeechSupported,
  loadVoices,
  speak,
  speechLocale,
} from "@/shared/speech";
import { requestWakeLock, releaseWakeLock } from "../data/wakeLock";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "@/shared/ui/icons";
import "./review.css"; // .sort-select dùng chung với filter bar
import "./listen.css";

interface Props {
  /** Toàn bộ entry — danh sách phát tự dựng và tự xáo lại mỗi vòng. */
  entries: VocabEntry[];
  lang: CloudLang;
  onClose: () => void;
}

const RATE_LABELS: Record<number, string> = { 0.75: "Chậm", 1: "Bình thường", 1.25: "Nhanh" };
const GAP_LABELS: Record<number, string> = { 2000: "2 giây", 4000: "4 giây", 6000: "6 giây" };

export function ListenSession({ entries, lang, onClose }: Props) {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [settings, setSettings] = useState<ListenSettings>(loadListenSettings);
  const [playlist, setPlaylist] = useState<VocabEntry[]>(() => buildListenPlaylist(entries, lang));
  const [index, setIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  // null = chưa biết máy có giọng nào. Chờ xong mới phát: danh sách giọng về
  // muộn (Chrome bắn `voiceschanged` sau lần gọi đầu) mà cứ phát trước thì
  // lượt đọc đầu rơi vào giọng mặc định rồi bị đọc lại khi danh sách tới.
  const [voices, setVoices] = useState<SpeechSynthesisVoice[] | null>(null);

  const card = playlist[index];
  const steps = useMemo(() => (card ? cardSteps(card, settings.gapMs) : []), [card, settings.gapMs]);
  // Nghĩa chỉ hiện đúng lúc máy đọc nghĩa: liếc màn hình vẫn là một lượt tự
  // kiểm tra chứ không lộ đáp án ngay.
  const meaningRevealed = stepIndex >= steps.length - 1;

  useEffect(() => {
    let stale = false;
    loadVoices().then((list) => {
      if (!stale) setVoices(list);
    });
    return () => {
      stale = true;
    };
  }, []);

  // Giọng đọc tắt theo màn hình; giữ màn sáng suốt lúc đang phát.
  useEffect(() => {
    if (!playing) return;
    const pending = requestWakeLock();
    return () => {
      pending.then(releaseWakeLock);
    };
  }, [playing]);

  // Ref để effect phát khỏi phải khai `advance` trong deps (nó đổi mỗi render).
  const advanceRef = useRef<() => void>(() => {});

  const jump = (delta: number) => {
    setStepIndex(0);
    const next = index + delta;
    if (next >= playlist.length) {
      // Hết vòng: dựng lại từ entry mới nhất rồi xáo lại, để vòng sau không
      // thuộc lòng theo thứ tự.
      setPlaylist(buildListenPlaylist(entries, lang));
      setIndex(0);
    } else {
      setIndex(next < 0 ? playlist.length - 1 : next);
    }
  };

  advanceRef.current = () => {
    if (stepIndex + 1 < steps.length) setStepIndex(stepIndex + 1);
    else jump(1);
  };

  useEffect(() => {
    const step = steps[stepIndex];
    if (!playing || !step || voices == null) return;

    let cancelled = false;
    const finish = () => {
      if (!cancelled) advanceRef.current();
    };

    if (step.kind === "pause") {
      const timer = setTimeout(finish, step.ms);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // Chỉ `cancel()` khi câu còn đọc dở: gọi cancel ngay trước một lượt speak
    // mới làm Chrome nuốt luôn lượt sau.
    let ended = false;
    speak(step.text, {
      locale: step.locale,
      rate: settings.rate,
      voice: findVoice(voices, step.locale),
    }).then(() => {
      ended = true;
      finish();
    });
    return () => {
      cancelled = true;
      if (!ended) cancelSpeech();
    };
  }, [playing, steps, stepIndex, settings.rate, voices]);

  const changeSettings = (patch: Partial<ListenSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveListenSettings(next);
  };

  const missingVoice =
    voices != null && voices.length > 0 && card != null && findVoice(voices, speechLocale(card.term_lang)) == null;

  if (!isSpeechSupported() || card == null) {
    return (
      <div className="listen-overlay">
        <div className="listen-panel" role="dialog" aria-modal="true" aria-label="Chế độ nghe" tabIndex={-1} ref={dialogRef}>
          <p className="listen-empty">
            {isSpeechSupported()
              ? "Chưa có từ nào đang học để nghe. Tra thêm vài từ rồi quay lại."
              : "Trình duyệt này không đọc được thành tiếng. Thử Chrome, Safari hoặc Edge."}
          </p>
          <button type="button" className="listen-done" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="listen-overlay">
      <div className="listen-panel" role="dialog" aria-modal="true" aria-label="Chế độ nghe" tabIndex={-1} ref={dialogRef}>
        <header className="listen-head">
          <span className="listen-progress">
            {index + 1} / {playlist.length}
          </span>
          <button type="button" className="listen-close" aria-label="Kết thúc phiên nghe" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        {/* Cả vùng chữ là nút phát/dừng: bấm-không-nhìn thì đích càng to càng tốt. */}
        <button
          type="button"
          className="listen-stage"
          aria-label={playing ? "Tạm dừng" : "Tiếp tục phát"}
          onClick={() => setPlaying((v) => !v)}
        >
          <span className="listen-term" lang={card.term_lang}>
            {card.term}
          </span>
          {card.reading && (
            <span className="listen-reading" lang={card.term_lang}>
              {card.reading}
            </span>
          )}
          <span className="listen-meaning">
            {meaningRevealed ? meaningToLines(card.meaning).join(" · ") : "···"}
          </span>
        </button>

        <div className="listen-controls">
          <button type="button" className="listen-nav" aria-label="Từ trước" onClick={() => jump(-1)}>
            <PrevIcon size={24} />
          </button>
          <button
            type="button"
            className="listen-play"
            aria-label={playing ? "Tạm dừng" : "Tiếp tục phát"}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? <PauseIcon size={32} /> : <PlayIcon size={32} />}
          </button>
          <button type="button" className="listen-nav" aria-label="Từ sau" onClick={() => jump(1)}>
            <NextIcon size={24} />
          </button>
        </div>

        <div className="listen-settings">
          <label className="sort-select">
            Tốc độ
            <select value={settings.rate} onChange={(e) => changeSettings({ rate: Number(e.target.value) })}>
              {LISTEN_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {RATE_LABELS[rate]}
                </option>
              ))}
            </select>
          </label>
          <label className="sort-select">
            Khoảng lặng
            <select value={settings.gapMs} onChange={(e) => changeSettings({ gapMs: Number(e.target.value) })}>
              {LISTEN_GAPS_MS.map((ms) => (
                <option key={ms} value={ms}>
                  {GAP_LABELS[ms]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {missingVoice && (
          <p className="listen-warn">
            Máy chưa có giọng đọc cho từ này — cài thêm gói giọng trong cài đặt hệ thống để nghe được.
          </p>
        )}
      </div>
    </div>
  );
}
