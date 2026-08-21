// Flashcard review session (SPEC 4.4): flip card, self-grade with 4 buttons.
// Each button shows the interval it would schedule (computed via the engine).
//
// Khi đã lật, mặt sau ngoài nghĩa cá nhân đã lưu còn có nút "Xem định nghĩa từ
// điển" — tải nghĩa từ các từ điển (kiểu DetailPanel) và render bằng `Definitions`
// ngay trong thẻ, không rời phiên ôn. Lazy: chỉ tải khi bấm, cache cho thẻ hiện tại.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { VocabEntry, ReviewGrade } from "@/shared/types";
import { gradeCard, isLeech } from "../domain/srs";
import { DAY } from "../domain/constants";
import {
  startSession,
  currentCard,
  applyGrade,
  undoGrade,
  canUndo,
  hasNextBatch,
  nextBatchSize,
  loadNextBatch,
} from "../domain/session";
import { isReadingMatch } from "../domain/readingPractice";
import { loadTypeReadingEnabled, saveTypeReadingEnabled } from "../domain/readingPracticeSettings";
import { cardFront } from "../domain/reverseMode";
import { loadReverseModeEnabled, saveReverseModeEnabled } from "../domain/reverseModeSettings";
import { evaluateSwipe } from "../domain/swipe";
import "./reverse.css";
import "./swipe.css";
import "./seal.css";
import { formatInterval } from "@/shared/format";
import { MeaningView } from "@/shared/ui/MeaningView";
import { Skeleton } from "@/shared/ui/Skeleton";
import { useDialog } from "@/shared/ui/useDialog";
import { Definitions } from "@/features/dictionary/ui/Definitions";
import { KanjiBreakdown } from "@/features/dictionary/ui/KanjiPanel";
import { TermResult } from "@/features/dictionary/data/search";
import { useTheme } from "@/features/theme/ThemeProvider";
import { FIXED_CAUTION, FIXED_OK, readableTextOn } from "@/features/theme/domain/theme";
import "./review.css";

interface Props {
  queue: VocabEntry[];
  onGrade: (entry: VocabEntry, grade: ReviewGrade) => Promise<VocabEntry>;
  /** Hoàn tác lượt chấm: ghi lại thẻ ở trạng thái trước khi chấm. */
  onUndo?: (entry: VocabEntry) => Promise<VocabEntry>;
  onClose: () => void;
  /** Tải định nghĩa từ điển cho một entry (dùng trong mặt sau thẻ ôn). Tìm dưới
   *  cặp ngôn ngữ của chính entry, không mở DetailPanel, không tính là lookup. */
  onLookupDetails?: (entry: VocabEntry) => Promise<TermResult[]>;
}

// Nhãn Việt hoá + phím tắt 1–4 (DESIGN §3.1 · §4): thứ tự khớp cột grade-buttons
// nên cũng khớp thứ tự phím số.
const GRADES: { grade: ReviewGrade; label: string; cls: string }[] = [
  { grade: "again", label: "Quên", cls: "again" },
  { grade: "hard", label: "Khó", cls: "hard" },
  { grade: "good", label: "Nhớ", cls: "good" },
  { grade: "easy", label: "Dễ", cls: "easy" },
];

const GRADE_KEYS: Record<string, ReviewGrade> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };

/** Tra nhanh nhãn/lớp màu theo grade — cho chỉ dấu swipe (#160). */
const GRADE_META = Object.fromEntries(GRADES.map((g) => [g.grade, g])) as Record<
  ReviewGrade,
  (typeof GRADES)[number]
>;

// Cú kéo bắt đầu trên phần tử tương tác trong thẻ (nút xem từ điển, link…)
// không phải swipe — click của chúng phải sống.
const INTERACTIVE_SELECTOR = "button, a, input, textarea, select, [role='button']";

// Rung nhẹ xác nhận chốt grade — trình duyệt không có vibrate (iOS Safari) bỏ qua êm.
const GRADE_HAPTIC_MS = 15;

// Chỉ dấu swipe mờ dần theo khoảng kéo: sàn opacity để nhãn đọc được ngay từ
// đầu cú kéo, đạt 1 khi chạm ngưỡng chốt.
const HINT_BASE_OPACITY = 0.25;

// Thời gian dấu son 合格 sống trên thẻ: khớp thời lượng animation 1500ms trong
// seal.css + đệm nhỏ. Gỡ bằng timeout thay vì animationend — người dùng bật
// "giảm chuyển động" thì animation bị tắt và animationend không bao giờ bắn.
const SEAL_FX_MS = 1600;

interface GradeCounts {
  again: number;
  hard: number;
  good: number;
  easy: number;
}
const EMPTY_COUNTS: GradeCounts = { again: 0, hard: 0, good: 0, easy: 0 };

/** Khoá gộp một entry theo term+reading — đồng âm không được gộp (xem CLAUDE.md). */
function entryKey(e: Pick<VocabEntry, "term" | "reading">): string {
  return `${e.term}:${e.reading ?? ""}`;
}

/** Thêm/thay một entry vào danh sách theo entryKey (giữ bản mới nhất, không trùng). */
function upsertByKey(list: VocabEntry[], entry: VocabEntry): VocabEntry[] {
  return [...list.filter((e) => entryKey(e) !== entryKey(entry)), entry];
}

export function ReviewSession({ queue, onGrade, onUndo, onClose, onLookupDetails }: Props) {
  // Chụp hàng đợi một lần lúc mở phiên và tự quản con trỏ ở `session` — xem
  // `domain/session.ts` (nếu bám `dueEntries` sống, chấm 1 thẻ làm mảng co lại
  // và con trỏ nhảy cóc qua thẻ kế). `queue` chỉ đọc lúc khởi tạo.
  const [session, setSession] = useState(() => startSession(queue));
  const [flipped, setFlipped] = useState(false);
  // Khoá trong lúc chấm/hoàn tác (await ghi dữ liệu) để tránh bấm kép làm lệch con trỏ.
  const [busy, setBusy] = useState(false);

  // Chế độ luyện chủ động tuỳ chọn (BACKLOG GĐ3): gõ cách đọc trước khi lật.
  // Chỉ là gợi ý mềm sau khi lật, KHÔNG chặn lật thẻ — né việc phải quyết cách
  // xử okurigana/nhiều cách đọc hợp lệ ở v1 (xem readingPractice.ts).
  const [typeReadingEnabled, setTypeReadingEnabled] = useState(loadTypeReadingEnabled);
  const [typedReading, setTypedReading] = useState("");

  // Chế độ đảo chiều (#164): mặt trước là NGHĨA, nhớ lại TỪ — mặt sau (MeaningView
  // với headword furigana) đã là "toàn cảnh thẻ" nên không cần đổi. Độc lập với gõ
  // cách đọc: bật cả hai thì nhìn nghĩa, gõ cách đọc của từ nhớ được rồi lật đối chiếu.
  const [reverseEnabled, setReverseEnabled] = useState(loadReverseModeEnabled);

  // Swipe 4 hướng (#160): theo dõi cú kéo trên thẻ ĐÃ LẬT bằng pointer events.
  // Chỉ giữ vector (dx, dy); hướng/ngưỡng do domain/swipe.ts quyết định.
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  // Sau một cú kéo thật (quá vùng chết), nuốt click phát sinh lúc thả tay —
  // không thì thẻ KẾ TIẾP bị lật ngay khi swipe vừa chốt grade.
  const suppressClickRef = useRef(false);

  // touch-action phải chốt TRƯỚC khi gesture chạm bắt đầu, nên đo "thẻ có cuộn
  // được không" liên tục bằng ResizeObserver trên mặt sau (nội dung lazy — từ
  // điển/kanji — nở ra sau khi lật) thay vì đo lúc pointerdown. Thẻ cuộn được →
  // nhường trục dọc cho cuộn chạm (swipe dọc vẫn chạy với chuột, touch-action
  // chỉ áp cho chạm) — xem swipe.css.
  const flashcardRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);
  const [cardScrollable, setCardScrollable] = useState(false);

  // Dấu son 合格 (DESIGN §5): đóng MỘT LẦN khi một từ chuyển sang LEARNED trong
  // phiên. `id` tăng dần để hai lần tốt nghiệp liên tiếp vẫn remount overlay
  // (animation chạy lại từ đầu).
  const [sealFx, setSealFx] = useState<{ term: string; id: number } | null>(null);

  // Escape đóng, focus đầu/trả focus, bẫy Tab (#119). Gọi MỘT LẦN, không trong
  // nhánh `if (!card)` bên dưới (Rules of Hooks) — cả 3 màn (thẻ đang ôn, hết
  // lô, hoàn thành) đều gắn cùng `dialogRef` vào div gốc của chúng; React tái
  // dùng cùng node DOM giữa các nhánh (cùng kiểu phần tử ở cùng vị trí) nên
  // listener không bị treo vào node đã gỡ.
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  // Thống kê cho màn tổng kết (#126): đếm dồn theo grade cho CẢ phiên (mọi lô),
  // không reset khi sang lô kế — chỉ mất khi đóng hẳn ReviewSession.
  const [gradeCounts, setGradeCounts] = useState<GradeCounts>(EMPTY_COUNTS);
  // Từ từng bị "Quên" ít nhất một lần trong phiên — KHÔNG gỡ khi sau đó tốt
  // nghiệp: đây là danh sách "đáng ôn thêm", không phải "còn đang kẹt" (mọi thẻ
  // Quên/Khó đều tự quay lại hàng đợi tới khi tốt nghiệp — xem applyGrade).
  const [forgotten, setForgotten] = useState<VocabEntry[]>([]);
  // Từ vừa tốt nghiệp LẦN ĐẦU trong phiên này (status chuyển sang LEARNED).
  const [graduated, setGraduated] = useState<VocabEntry[]>([]);
  // Mọi thẻ đã chấm trong phiên (mọi grade) — chỉ để tính forecast 24h bên dưới.
  const [allGraded, setAllGraded] = useState<VocabEntry[]>([]);

  const { theme } = useTheme();
  // Màu chữ tính theo contrast thật với nền thật của từng nút (#124) — không
  // hardcode trắng: --accent/--warn đổi theo theme (kể cả preset tối màu chữ
  // sáng như "Tối"), --caution/--ok là token cố định (không có trong bảng màu
  // tuỳ biến) nên mirror hằng số từ theme.ts. Xem theme.test.ts cho mọi preset.
  const gradeTextColor = useMemo<Record<ReviewGrade, string>>(
    () => ({
      again: readableTextOn(theme.warn),
      hard: readableTextOn(FIXED_CAUTION),
      good: readableTextOn(FIXED_OK),
      easy: readableTextOn(theme.accent),
    }),
    [theme.warn, theme.accent],
  );

  // Định nghĩa từ điển cho thẻ đang xem (lazy, cache theo từ). Reset khi đổi thẻ.
  const [dictResults, setDictResults] = useState<TermResult[] | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  // Request id: tăng khi đổi thẻ → mọi request đang chạy cho thẻ cũ bị coi là stale.
  const detailReqRef = useRef(0);

  const card = currentCard(session);

  // Đổi thẻ (grade sang thẻ kế) → xoá cache định nghĩa, huỷ request cũ và dọn
  // cú kéo dở (phòng hờ — pointerup/cancel thường đã dọn trước khi grade).
  useEffect(() => {
    detailReqRef.current++;
    setDictResults(null);
    setDictLoading(false);
    setDictError(null);
    setTypedReading("");
    dragStartRef.current = null;
    setDrag(null);
    // Cờ nuốt-click thường được chính click lúc thả tay tiêu thụ (chạy trước
    // effect này); nếu trình duyệt không bắn click thì dọn ở đây để không nuốt
    // oan cú tap kế tiếp trên thẻ mới.
    suppressClickRef.current = false;
  }, [card?.term]);

  // Đo lại khả năng cuộn của thẻ khi lật/đổi thẻ và mỗi khi mặt sau đổi chiều
  // cao (ResizeObserver bắt được các khối lazy nở ra) — xem chú thích ở state.
  useEffect(() => {
    if (!flipped) return;
    const el = flashcardRef.current;
    const back = backRef.current;
    if (!el || !back) return;
    const measure = () => setCardScrollable(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(back);
    return () => observer.disconnect();
  }, [flipped, card?.term]);

  // Dấu son sống đúng SEAL_FX_MS rồi tự gỡ (vì sao timeout: xem hằng số).
  useEffect(() => {
    if (!sealFx) return;
    const timer = setTimeout(() => setSealFx(null), SEAL_FX_MS);
    return () => clearTimeout(timer);
  }, [sealFx]);

  const previews = useMemo(() => {
    if (!card) return {} as Record<ReviewGrade, string>;
    const now = Date.now();
    const out = {} as Record<ReviewGrade, string>;
    for (const { grade } of GRADES) {
      out[grade] = formatInterval(gradeCard(card, grade, now).srs_interval);
    }
    return out;
  }, [card]);

  // Phím tắt (DESIGN §3.1/§4): Space lật thẻ, 1–4 chấm điểm khi đã lật. Bỏ qua
  // khi đang gõ vào một ô nhập (phòng hờ — thẻ ôn hiện không có input, nhưng
  // an toàn nếu sau này thêm một cái). `grade` là function declaration (hoisted)
  // nên tham chiếu được dù khai báo bên dưới trong cùng scope component.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (busy || !card) return;
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      if (e.key === " ") {
        e.preventDefault();
        if (!flipped) setFlipped(true);
        return;
      }
      if (flipped) {
        const g = GRADE_KEYS[e.key];
        if (g) {
          e.preventDefault();
          grade(g);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, card, flipped]);

  function reviewAgain(entries: VocabEntry[]) {
    if (entries.length === 0) return;
    setSession(startSession(entries));
    setFlipped(false);
  }

  // Trong 24 giờ tới, có bao nhiêu từ VỪA ÔN trong phiên này sẽ đến hạn lại —
  // "forecast" tính trên chính các thẻ đã chấm (không phải toàn bộ kho từ,
  // dữ liệu đó không có trong ReviewSession — xem BACKLOG GĐ2 "Hôm nay").
  const forecastWindowMs = DAY * 60_000;
  const now = Date.now();
  const forecastCount = allGraded.filter(
    (e) => e.next_review != null && e.next_review > now && e.next_review <= now + forecastWindowMs,
  ).length;

  const summary = (
    <SessionSummary
      counts={gradeCounts}
      forgotten={forgotten}
      graduated={graduated}
      forecastCount={forecastCount}
      onReviewAgain={reviewAgain}
    />
  );

  // Dấu son 合格 phủ lên thẻ. Render ở CẢ ba màn (đang ôn / hết lô / hoàn thành)
  // — thẻ cuối phiên tốt nghiệp là chuyện thường, khoảnh khắc không được rơi mất.
  // aria-hidden: trang trí thuần; màn tổng kết đã liệt kê từ tốt nghiệp bằng chữ.
  const sealOverlay = sealFx && (
    <div className="grad-seal" key={sealFx.id} aria-hidden>
      <div className="grad-seal-fx">
        <div className="grad-seal-stamp" lang="ja">合格</div>
        <div className="grad-seal-term">「{sealFx.term}」 đã thuộc</div>
      </div>
    </div>
  );

  // Hết lô hiện tại: nếu còn thẻ chờ thì mời ôn tiếp lô kế (điểm dừng tự nhiên),
  // ngược lại là màn tổng kết phiên. Tái dùng khung `.review-card done`.
  if (!card) {
    if (hasNextBatch(session)) {
      const remaining = nextBatchSize(session);
      return (
        <div className="review-overlay">
          <div className="review-card done" role="dialog" aria-modal="true" tabIndex={-1} ref={dialogRef}>
            {sealOverlay}
            <h2>Xong một lô!</h2>
            <p>Đã ôn {session.reviewed} thẻ. Còn {session.pending.length} thẻ đến hạn.</p>
            {summary}
            <button className="primary" onClick={() => setSession((s) => loadNextBatch(s))}>
              Ôn tiếp {remaining} thẻ nữa
            </button>
            <div className="review-footer">
              <button className="link close" onClick={onClose}>Kết thúc phiên</button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="review-overlay">
        <div className="review-card done" role="dialog" aria-modal="true" tabIndex={-1} ref={dialogRef}>
          {sealOverlay}
          <h2>Hoàn thành!</h2>
          <p>Bạn đã ôn {session.reviewed} thẻ.</p>
          {summary}
          <button className="primary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    );
  }

  async function grade(g: ReviewGrade) {
    if (!card || busy) return;
    // Haptic nhẹ ngay lúc chốt grade (mọi ngả: swipe, nút, phím) — optional
    // chaining nên môi trường không hỗ trợ chỉ đơn giản không rung.
    navigator.vibrate?.(GRADE_HAPTIC_MS);
    setBusy(true);
    try {
      const prevStatus = card.status;
      const graded = await onGrade(card, g);
      setSession((s) => applyGrade(s, graded));
      setGradeCounts((c) => ({ ...c, [g]: c[g] + 1 }));
      setAllGraded((list) => upsertByKey(list, graded));
      // Danh sách "đáng ôn thêm" — không gỡ khi sau đó tốt nghiệp (xem khai báo state).
      if (g === "again") setForgotten((list) => upsertByKey(list, graded));
      if (graded.status === "LEARNED" && prevStatus !== "LEARNED") {
        setGraduated((list) => upsertByKey(list, graded));
        setSealFx((fx) => ({ term: graded.term, id: (fx?.id ?? 0) + 1 }));
      }
      setFlipped(false);
    } finally {
      setBusy(false);
    }
  }

  // Hoàn tác lượt chấm gần nhất: khôi phục thẻ vừa chấm về đầu hàng đợi và ghi
  // lại trạng thái trước-chấm của nó (undoGrade thuần nên rẻ).
  async function undo() {
    if (busy || !onUndo) return;
    const result = undoGrade(session);
    if (!result) return;
    setBusy(true);
    try {
      await onUndo(result.restore);
      setSession(result.session);
      setFlipped(false);
    } finally {
      setBusy(false);
    }
  }

  // Lazy: tải định nghĩa từ điển khi bấm nút. Dùng request-id để bỏ qua kết quả
  // stale nếu người dùng đã grade sang thẻ khác trước khi tải xong.
  async function showDictDetails() {
    if (!card || !onLookupDetails || dictLoading || dictResults !== null) return;
    const req = ++detailReqRef.current;
    setDictLoading(true);
    setDictError(null);
    try {
      const results = await onLookupDetails(card);
      if (req !== detailReqRef.current) return; // đã đổi thẻ
      setDictResults(results);
    } catch (err) {
      if (req !== detailReqRef.current) return;
      setDictError((err as Error).message || "Lỗi tải định nghĩa");
    } finally {
      if (req === detailReqRef.current) setDictLoading(false);
    }
  }

  // Chỉ có cách đọc kana cho từ tiếng Nhật — ẩn ô gõ với thẻ khác/không có reading.
  const showReadingInput = typeReadingEnabled && card.term_lang === "ja" && !!card.reading;
  const readingAttempt = typedReading.trim();

  // Mặt trước theo chế độ (thẻ không có nghĩa đọc được thì rơi về mặt từ — xem domain).
  const front = cardFront(reverseEnabled, card);

  function toggleTypeReading(enabled: boolean) {
    setTypeReadingEnabled(enabled);
    saveTypeReadingEnabled(enabled);
  }

  function toggleReverseMode(enabled: boolean) {
    setReverseEnabled(enabled);
    saveReverseModeEnabled(enabled);
  }

  // --- Swipe 4 hướng (#160): pointer events trên thẻ đã lật ---

  function onCardPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!flipped || busy) return;
    if (e.target instanceof Element && e.target.closest(INTERACTIVE_SELECTOR)) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    // Capture để move/up vẫn về thẻ khi tay kéo vượt ra ngoài viền.
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    setDrag({ dx: e.clientX - start.x, dy: e.clientY - start.y });
  }

  function onCardPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    dragStartRef.current = null;
    setDrag(null);
    const hint = evaluateSwipe(e.clientX - start.x, e.clientY - start.y);
    if (!hint) return; // trong vùng chết: là tap, để click chạy bình thường
    suppressClickRef.current = true;
    if (hint.committed) grade(hint.grade);
  }

  function onCardPointerCancel() {
    // Trình duyệt giành gesture (vd. cuộn chạm trên thẻ pan-y) → huỷ cú kéo êm.
    dragStartRef.current = null;
    setDrag(null);
  }

  function onCardClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setFlipped(true);
  }

  const swipeHint = flipped && drag ? evaluateSwipe(drag.dx, drag.dy) : null;
  const flashcardCls = [
    "flashcard",
    flipped ? "swipeable" : "",
    flipped && cardScrollable ? "can-scroll" : "",
    drag ? "dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="review-overlay">
      <div className="review-card" role="dialog" aria-modal="true" tabIndex={-1} ref={dialogRef}>
        <div className="review-progress">
          Còn {session.queue.length} · đã ôn {session.reviewed}
          {card.status === "RELAPSED" && <span className="badge inline">! tái quên</span>}
        </div>

        {/* Thẻ leech (khó nhằn): rớt quá nhiều lần → chỉ cảnh báo + gợi ý, KHÔNG
            tự hoãn/xoá (để người dùng quyết). Huy hiệu đi kèm gợi ý hành động. */}
        {isLeech(card) && (
          <div className="leech-note" role="note">
            <span className="leech-badge">Khó nhằn</span>
            <span className="leech-hint">
              Bạn hay quên từ này — cân nhắc sửa lại nghĩa cho dễ nhớ hơn, hoặc tạm gác để học riêng.
            </span>
          </div>
        )}

        <div
          className={flashcardCls}
          ref={flashcardRef}
          style={
            drag
              ? ({ "--swipe-x": `${drag.dx}px`, "--swipe-y": `${drag.dy}px` } as CSSProperties)
              : undefined
          }
          onClick={onCardClick}
          onPointerDown={onCardPointerDown}
          onPointerMove={onCardPointerMove}
          onPointerUp={onCardPointerUp}
          onPointerCancel={onCardPointerCancel}
        >
          {front.kind === "term" ? (
            <div className="front">{front.text}</div>
          ) : (
            <div className="front front-meaning">
              {front.lines.length === 1 ? (
                front.lines[0]
              ) : (
                <ol>
                  {front.lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {flipped && (
            <div className="back" ref={backRef}>
              {showReadingInput && readingAttempt && (
                <p className={`reading-feedback ${isReadingMatch(readingAttempt, card.reading) ? "correct" : "wrong"}`}>
                  Bạn gõ: <b>{readingAttempt}</b> ·{" "}
                  {isReadingMatch(readingAttempt, card.reading)
                    ? "đúng"
                    : `chưa đúng — đáp án: ${card.reading}`}
                </p>
              )}
              <MeaningView
                term={card.term}
                reading={card.reading}
                pos={card.pos}
                meaning={card.meaning}
                example={card.example}
                analysis={card.sentence_analysis}
              />

              {/* Định nghĩa từ các từ điển — lazy, chỉ tải khi bấm. Không truyền
                  onLookup để link nội bộ trong nghĩa render thành chữ thường,
                  không rời phiên ôn. */}
              {onLookupDetails && dictResults === null && !dictLoading && (
                <button type="button" className="link review-dict-toggle" onClick={showDictDetails}>
                  Xem định nghĩa từ điển
                </button>
              )}
              {dictLoading && <Skeleton lines={3} className="review-dict-status" />}
              {dictError && <p className="muted review-dict-status">{dictError}</p>}
              {dictResults !== null && (
                <div className="review-dict">
                  <p className="review-dict-label">Trong từ điển</p>
                  {dictResults.length === 0 ? (
                    <p className="muted">Không tìm thấy trong từ điển.</p>
                  ) : (
                    dictResults.map((res, i) => (
                      <div className="result" key={i}>
                        {dictResults.length > 1 && res.entry.dictionary && (
                          <span className="dict-name">{res.entry.dictionary}</span>
                        )}
                        <Definitions
                          senses={res.entry.senses}
                          definitions={res.entry.definitions}
                          tagMeta={res.entry.tagMeta}
                        />
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Phân tích chữ Hán — chỉ với từ tiếng Nhật (kanji là dữ liệu server,
                  kiểu jisho). Tải lười ngay khi mở; không truyền onLookup nên link
                  từ ví dụ không rời phiên ôn. */}
              {card.term_lang === "ja" && (
                <KanjiBreakdown term={card.term} src={card.term_lang} tgt={card.native_lang} />
              )}
            </div>
          )}
          {!flipped && showReadingInput && (
            <div className="reading-attempt" onClick={(e) => e.stopPropagation()}>
              <label htmlFor="reading-attempt-input">
                {front.kind === "meaning"
                  ? "Nhớ lại từ rồi gõ cách đọc (romaji hoặc kana):"
                  : "Gõ cách đọc (romaji hoặc kana):"}
              </label>
              <input
                id="reading-attempt-input"
                type="text"
                autoFocus
                value={typedReading}
                onChange={(e) => setTypedReading(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setFlipped(true);
                }}
              />
            </div>
          )}
          {!flipped && !showReadingInput && <p className="hint">Nhấn hoặc bấm Space để lật đáp án</p>}
        </div>

        {/* Chỉ dấu hướng swipe: nhãn grade + interval xem trước, đậm dần theo
            khoảng kéo (sàn HINT_BASE_OPACITY). Màu chữ tính như nút grade (#124). */}
        {swipeHint && (
          <div className="swipe-hint" aria-hidden>
            <span
              className={`swipe-hint-label ${GRADE_META[swipeHint.grade].cls}`}
              style={{
                opacity: HINT_BASE_OPACITY + (1 - HINT_BASE_OPACITY) * swipeHint.progress,
                color: gradeTextColor[swipeHint.grade],
              }}
            >
              {GRADE_META[swipeHint.grade].label}
              <span className="swipe-hint-interval">{previews[swipeHint.grade]}</span>
            </span>
          </div>
        )}
        {sealOverlay}

        {flipped ? (
          <>
            <div className="grade-buttons">
              {GRADES.map(({ grade: g, label, cls }, i) => (
                <button
                  key={g}
                  className={`grade ${cls}`}
                  style={{ color: gradeTextColor[g] }}
                  onClick={() => grade(g)}
                >
                  <span className="grade-label">
                    {label} <span className="grade-key">{i + 1}</span>
                  </span>
                  <span className="grade-interval">{previews[g]}</span>
                </button>
              ))}
            </div>
            <p className="grade-hint">Phím 1–4 hoặc kéo thẻ: ← Quên · → Nhớ · ↑ Dễ · ↓ Khó</p>
          </>
        ) : (
          <button className="primary flip" onClick={() => setFlipped(true)}>Lật thẻ</button>
        )}

        <div className="review-footer">
          {onUndo && (
            <button
              type="button"
              className="link"
              onClick={undo}
              disabled={!canUndo(session) || busy}
            >
              Hoàn tác
            </button>
          )}
          <label className="chk reading-toggle">
            <input
              type="checkbox"
              checked={typeReadingEnabled}
              onChange={(e) => toggleTypeReading(e.target.checked)}
            />
            Gõ cách đọc trước khi lật
          </label>
          <label className="chk reverse-toggle">
            <input
              type="checkbox"
              checked={reverseEnabled}
              onChange={(e) => toggleReverseMode(e.target.checked)}
            />
            Đảo chiều: nghĩa → từ
          </label>
          <button className="link close" onClick={onClose}>Kết thúc phiên</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Màn tổng kết phiên ôn (#126): breakdown theo grade, từ vừa tốt nghiệp (điểm
 * thưởng — DESIGN §5), từ vừa "Quên" kèm lối vào ôn lại ngay, và forecast 24h
 * cho riêng các thẻ vừa ôn (không phải toàn kho — xem ghi chú ở nơi gọi).
 */
function SessionSummary({
  counts,
  forgotten,
  graduated,
  forecastCount,
  onReviewAgain,
}: {
  counts: GradeCounts;
  forgotten: VocabEntry[];
  graduated: VocabEntry[];
  forecastCount: number;
  onReviewAgain: (entries: VocabEntry[]) => void;
}) {
  const total = counts.again + counts.hard + counts.good + counts.easy;
  if (total === 0) return null;

  return (
    <div className="review-summary">
      <ul className="review-breakdown">
        <li><span className="grade-dot again" aria-hidden /> Quên <b>{counts.again}</b></li>
        <li><span className="grade-dot hard" aria-hidden /> Khó <b>{counts.hard}</b></li>
        <li><span className="grade-dot good" aria-hidden /> Nhớ <b>{counts.good}</b></li>
        <li><span className="grade-dot easy" aria-hidden /> Dễ <b>{counts.easy}</b></li>
      </ul>

      {graduated.length > 0 && (
        <p className="review-graduated">
          <span className="seal-badge" aria-hidden lang="ja">合格</span>{" "}
          {graduated.length} từ vừa tốt nghiệp:{" "}
          {graduated.map((e) => e.term).join("、")}
        </p>
      )}

      {forgotten.length > 0 && (
        <div className="review-forgotten">
          <p>
            {forgotten.length} từ vừa quên: {forgotten.map((e) => e.term).join("、")}
          </p>
          <button type="button" className="link" onClick={() => onReviewAgain(forgotten)}>
            Ôn lại {forgotten.length} từ này ngay
          </button>
        </div>
      )}

      {forecastCount > 0 && (
        <p className="review-forecast">
          Trong 24 giờ tới: {forecastCount} từ vừa ôn sẽ đến hạn lại.
        </p>
      )}
    </div>
  );
}

