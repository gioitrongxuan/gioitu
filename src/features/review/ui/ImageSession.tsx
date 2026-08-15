// Chế độ hình ảnh: trình chiếu ảnh minh hoạ của các từ đang học để ôn bằng mắt
// (#263). Không chấm điểm, không ghi gì — song sinh với chế độ nghe, chỉ khác
// giác quan (xem docs/FEATURES.md).
//
// Khác chế độ nghe ở một điểm cốt tử: dữ liệu KHÔNG có sẵn trong máy. Ảnh chỉ
// nằm ở từ điển máy chủ và không có endpoint lấy theo lô, nên mỗi thẻ là một
// lượt gọi mạng. Vì vậy trình chiếu tự lo ba việc mà chế độ nghe không cần:
// nạp trước thẻ kế (để không khựng giữa hai thẻ), bỏ qua từ không có ảnh, và
// chịu thua có kiểm soát khi cả một dải từ đều trắng ảnh.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { VocabEntry } from "@/shared/types";
import { meaningToLines } from "@/shared/meaning";
import { DictImage } from "@/shared/dictionary";
import { CloudLang } from "../domain/wordcloud";
import {
  buildImagePlaylist,
  cardSteps,
  shouldGiveUp,
  wordImageKey,
} from "../domain/imageMode";
import {
  IMAGE_HOLD_MS,
  loadImageModeSettings,
  saveImageModeSettings,
  type ImageModeSettings,
} from "../domain/imageModeSettings";
import { fetchWordImages } from "../data/wordImages";
import { requestWakeLock, releaseWakeLock } from "../data/wakeLock";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "@/shared/ui/icons";
import "./review.css"; // .sort-select dùng chung với filter bar
import "./imageMode.css";

interface Props {
  /** Toàn bộ entry — danh sách chiếu tự dựng và tự xáo lại mỗi vòng. */
  entries: VocabEntry[];
  lang: CloudLang;
  onClose: () => void;
}

const HOLD_LABELS: Record<number, string> = { 3000: "3 giây", 5000: "5 giây", 8000: "8 giây" };

export function ImageSession({ entries, lang, onClose }: Props) {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [settings, setSettings] = useState<ImageModeSettings>(loadImageModeSettings);
  const [playlist, setPlaylist] = useState<VocabEntry[]>(() => buildImagePlaylist(entries, lang));
  const [index, setIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  /** Ảnh đã lấy được theo `wordImageKey`; vắng khoá = chưa nạp xong. */
  const [images, setImages] = useState<Record<string, DictImage[]>>({});
  /** Ảnh đang thử trong danh sách dự phòng của thẻ — nhích lên khi URL chết. */
  const [imgIndex, setImgIndex] = useState(0);
  /** Số từ liên tiếp không có ảnh; về 0 ngay khi có một thẻ chiếu được. */
  const [misses, setMisses] = useState(0);
  const [netError, setNetError] = useState(false);

  // Khoá đã gửi đi hỏi, để hai lượt render không cùng gọi mạng cho một từ. Ref
  // (không phải state) vì nó chỉ điều phối hiệu ứng phụ, không vẽ ra gì.
  const requested = useRef<Set<string>>(new Set());

  const card = playlist[index];
  const steps = useMemo(() => cardSteps(settings), [settings]);
  const revealed = steps[stepIndex]?.kind === "reveal";

  const cardImages = card ? images[wordImageKey(card)] : undefined;
  /** Thẻ này không chiếu được: từ điển không có ảnh, hoặc mọi URL đều chết. */
  const missing = cardImages != null && imgIndex >= cardImages.length;
  const gaveUp = shouldGiveUp(misses, playlist.length);
  const src = cardImages?.[imgIndex]?.url;

  // Nạp ảnh cho thẻ hiện tại VÀ thẻ kế: một lượt gọi mất vài trăm ms, nạp trước
  // thì lúc sang thẻ mới ảnh đã nằm sẵn thay vì chớp một nhịp trống.
  //
  // Cố ý KHÔNG có cờ "stale" huỷ kết quả trong cleanup: kết quả về theo KHOÁ
  // TỪ nên tới muộn vẫn đúng chỗ, mà `requested` thì đã đánh dấu là "đã hỏi".
  // Bỏ kết quả muộn đi là mất luôn — không ai hỏi lại nữa và thẻ đó treo mãi ở
  // khung chờ. Rất dễ gặp: bấm "Từ sau" nhanh tay lúc lượt gọi còn đang bay
  // (và ở dev, StrictMode mount hai lần là dính ngay).
  useEffect(() => {
    if (netError) return;
    for (const word of [playlist[index], playlist[index + 1]]) {
      if (!word) continue;
      const key = wordImageKey(word);
      if (requested.current.has(key)) continue;
      requested.current.add(key);
      fetchWordImages(word)
        .then((found) => setImages((prev) => ({ ...prev, [key]: found })))
        .catch(() => {
          // Mất mạng: cho phép hỏi lại từ này ở vòng sau thay vì nhớ một kết
          // quả rỗng giả, rồi báo đúng lý do thay vì "không có ảnh".
          requested.current.delete(key);
          setNetError(true);
        });
    }
  }, [playlist, index, netError]);

  // Ref để các effect khỏi phải khai `jump` trong deps (nó đổi mỗi render).
  const jumpRef = useRef<(delta: number) => void>(() => {});

  jumpRef.current = (delta: number) => {
    setStepIndex(0);
    setImgIndex(0);
    const next = index + delta;
    if (next >= playlist.length) {
      // Hết vòng: dựng lại từ entry mới nhất rồi xáo lại, để vòng sau không
      // thuộc lòng theo thứ tự.
      setPlaylist(buildImagePlaylist(entries, lang));
      setIndex(0);
    } else {
      setIndex(next < 0 ? playlist.length - 1 : next);
    }
  };

  // Từ không có ảnh thì bỏ qua NGAY, không bắt người xem ngồi nhìn ô trống hết
  // lượt. Đếm để còn biết lúc nào nên thôi (cả kho có thể chưa từ nào có ảnh).
  useEffect(() => {
    if (!missing || gaveUp) return;
    setMisses((m) => m + 1);
    jumpRef.current(1);
  }, [missing, index, gaveUp]);

  // Chiếu được một thẻ nghĩa là dải trắng ảnh đã đứt — đếm lại từ đầu.
  useEffect(() => {
    if (src) setMisses(0);
  }, [src]);

  // Màn hình tắt là mất luôn thứ đang xem; giữ sáng suốt lúc đang chiếu.
  useEffect(() => {
    if (!playing) return;
    const pending = requestWakeLock();
    return () => {
      pending.then(releaseWakeLock);
    };
  }, [playing]);

  // Đồng hồ chuyển bước. Chỉ chạy khi ảnh đã sẵn sàng: đang chờ mạng mà vẫn đếm
  // giờ thì thẻ trôi qua trước cả khi ảnh kịp hiện.
  useEffect(() => {
    const step = steps[stepIndex];
    if (!playing || !step || !src) return;
    const timer = setTimeout(() => {
      if (stepIndex + 1 < steps.length) setStepIndex(stepIndex + 1);
      else jumpRef.current(1);
    }, step.ms);
    return () => clearTimeout(timer);
  }, [playing, steps, stepIndex, src, index]);

  // Nhánh đang hiển thị. Khác chế độ nghe ở chỗ nhánh đổi được GIỮA CHỪNG (đang
  // chiếu → mất mạng / hết ảnh để dò), mà đổi nhánh là thay sạch ruột panel:
  // phần tử đang giữ focus biến mất, focus rơi về <body>, và listener Escape
  // của useDialog (gắn trên chính panel) không còn nhận được phím. Kéo focus về
  // panel mỗi lần đổi nhánh để bàn phím vẫn đóng được overlay.
  const branch = card == null ? "empty" : netError ? "error" : gaveUp ? "giveup" : "play";
  const shownBranch = useRef(branch);
  useEffect(() => {
    if (shownBranch.current === branch) return; // lần đầu: useDialog đã lo focus
    shownBranch.current = branch;
    dialogRef.current?.focus();
  }, [branch, dialogRef]);

  const changeSettings = (patch: Partial<ImageModeSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveImageModeSettings(next);
    // Về bước đầu của thẻ: bật "hiện ngay" lúc đang ở bước 2 thì chuỗi bước rút
    // còn một, con trỏ bước cũ trỏ ra ngoài mảng và đồng hồ đứng luôn.
    setStepIndex(0);
  };

  const panel = (body: ReactNode) => (
    <div className="imgmode-overlay">
      <div
        className="imgmode-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Chế độ hình ảnh"
        tabIndex={-1}
        ref={dialogRef}
      >
        {body}
      </div>
    </div>
  );

  if (card == null) {
    return panel(
      <>
        <p className="imgmode-empty">
          Chưa có từ nào đang học để xem ảnh. Tra thêm vài từ rồi quay lại.
        </p>
        <button type="button" className="imgmode-done" onClick={onClose}>
          Đóng
        </button>
      </>,
    );
  }

  if (netError) {
    return panel(
      <>
        <p className="imgmode-empty">
          Không gọi được máy chủ từ điển, mà ảnh minh hoạ chỉ có ở đó. Kiểm tra
          kết nối rồi mở lại chế độ này.
        </p>
        <button type="button" className="imgmode-done" onClick={onClose}>
          Đóng
        </button>
      </>,
    );
  }

  if (gaveUp) {
    return panel(
      <>
        <p className="imgmode-empty">
          Đã xem qua {misses} từ mà chưa từ nào có ảnh minh hoạ. Từ điển máy chủ
          mới có ảnh cho một phần từ vựng — thử tìm tiếp hoặc quay lại sau.
        </p>
        <div className="imgmode-empty-actions">
          <button type="button" className="imgmode-done" onClick={() => setMisses(0)}>
            Tìm tiếp
          </button>
          <button type="button" className="imgmode-done" onClick={onClose}>
            Đóng
          </button>
        </div>
      </>,
    );
  }

  return panel(
    <>
      <header className="imgmode-head">
        <span className="imgmode-progress">
          {index + 1} / {playlist.length}
        </span>
        <button
          type="button"
          className="imgmode-close"
          aria-label="Kết thúc phiên xem ảnh"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      {/* Cả sân khấu là một nút: đang ở bước tự nhớ thì bấm để lật ra đáp án
          (đúng idiom "tap lật" của phiên ôn), lật rồi thì bấm để dừng/chạy. */}
      <button
        type="button"
        className="imgmode-stage"
        aria-label={revealed ? (playing ? "Tạm dừng" : "Tiếp tục chiếu") : "Hiện đáp án"}
        onClick={() => {
          if (!revealed) setStepIndex(steps.length - 1);
          else setPlaying((v) => !v);
        }}
      >
        <span className="imgmode-frame">
          {src ? (
            <img
              // key theo URL: đổi thẻ mà React tái dùng cùng thẻ <img> thì ảnh
              // cũ còn đứng đó tới lúc ảnh mới tải xong — nhìn như sai đáp án.
              key={src}
              src={src}
              alt=""
              loading="eager"
              referrerPolicy="no-referrer"
              onError={() => setImgIndex((i) => i + 1)}
            />
          ) : (
            <span className="imgmode-loading skeleton-line" aria-hidden />
          )}
        </span>

        {/* Đáp án chỉ hiện ở bước cuối; trước đó là "···" giữ chỗ. Khối này giữ
            chiều cao cố định (xem .imgmode-answer) để lúc lật ra đáp án, hàng
            nút phía dưới không bị đẩy xuống ngay dưới ngón tay đang bấm. */}
        <span className="imgmode-answer">
          {revealed ? (
            <>
              <span className="imgmode-term" lang={card.term_lang}>
                {card.term}
              </span>
              {card.reading && (
                <span className="imgmode-reading" lang={card.term_lang}>
                  {card.reading}
                </span>
              )}
              <span className="imgmode-meaning">{meaningToLines(card.meaning).join(" · ")}</span>
            </>
          ) : (
            <span className="imgmode-term" aria-hidden>
              ···
            </span>
          )}
        </span>
      </button>

      <div className="imgmode-controls">
        <button
          type="button"
          className="imgmode-nav"
          aria-label="Từ trước"
          onClick={() => jumpRef.current(-1)}
        >
          <PrevIcon size={24} />
        </button>
        <button
          type="button"
          className="imgmode-play"
          aria-label={playing ? "Tạm dừng" : "Tiếp tục chiếu"}
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? <PauseIcon size={32} /> : <PlayIcon size={32} />}
        </button>
        <button
          type="button"
          className="imgmode-nav"
          aria-label="Từ sau"
          onClick={() => jumpRef.current(1)}
        >
          <NextIcon size={24} />
        </button>
      </div>

      <div className="imgmode-settings">
        <label className="sort-select">
          Mỗi ảnh
          <select
            value={settings.holdMs}
            onChange={(e) => changeSettings({ holdMs: Number(e.target.value) })}
          >
            {IMAGE_HOLD_MS.map((ms) => (
              <option key={ms} value={ms}>
                {HOLD_LABELS[ms]}
              </option>
            ))}
          </select>
        </label>
        <label className="sort-select">
          Đáp án
          <select
            value={settings.revealAtOnce ? "now" : "later"}
            onChange={(e) => changeSettings({ revealAtOnce: e.target.value === "now" })}
          >
            <option value="later">Sau khi tự nhớ</option>
            <option value="now">Hiện ngay</option>
          </select>
        </label>
      </div>

      {/* Đang dò qua một dải từ trắng ảnh thì thẻ bay vèo vèo — nói ra để người
          xem biết đó là máy đang tìm, không phải trình chiếu bị lỗi. */}
      {misses > 0 && <p className="imgmode-hint">Đang bỏ qua từ chưa có ảnh…</p>}
    </>,
  );
}
