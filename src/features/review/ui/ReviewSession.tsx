// Flashcard review session (SPEC 4.4): flip card, self-grade with 4 buttons.
// Each button shows the interval it would schedule (computed via the engine).
//
// Khi đã lật, mặt sau ngoài nghĩa cá nhân đã lưu còn có nút "Xem định nghĩa từ
// điển" — tải nghĩa từ các từ điển (kiểu DetailPanel) và render bằng `Definitions`
// ngay trong thẻ, không rời phiên ôn. Lazy: chỉ tải khi bấm, cache cho thẻ hiện tại.

import { useEffect, useMemo, useRef, useState } from "react";
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
import { formatInterval } from "@/shared/format";
import { MeaningView } from "@/shared/ui/MeaningView";
import { Skeleton } from "@/shared/ui/Skeleton";
import { useDialog } from "@/shared/ui/useDialog";
import { Definitions } from "@/features/dictionary/ui/Definitions";
import { KanjiBreakdown } from "@/features/dictionary/ui/KanjiPanel";
import { TermResult } from "@/features/dictionary/data/search";
import { useTheme } from "@/features/theme/ThemeProvider";
import { FIXED_CAUTION, FIXED_OK, readableTextOn } from "@/features/theme/domain/theme";

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

  // Đổi thẻ (grade sang thẻ kế) → xoá cache định nghĩa và huỷ request cũ.
  useEffect(() => {
    detailReqRef.current++;
    setDictResults(null);
    setDictLoading(false);
    setDictError(null);
  }, [card?.term]);

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

  // Hết lô hiện tại: nếu còn thẻ chờ thì mời ôn tiếp lô kế (điểm dừng tự nhiên),
  // ngược lại là màn tổng kết phiên. Tái dùng khung `.review-card done`.
  if (!card) {
    if (hasNextBatch(session)) {
      const remaining = nextBatchSize(session);
      return (
        <div className="review-overlay">
          <div className="review-card done" role="dialog" aria-modal="true" tabIndex={-1} ref={dialogRef}>
            <h2>Xong một lô! 🎉</h2>
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
          <h2>Hoàn thành! 🎉</h2>
          <p>Bạn đã ôn {session.reviewed} thẻ.</p>
          {summary}
          <button className="primary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    );
  }

  async function grade(g: ReviewGrade) {
    if (!card || busy) return;
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

        <div className="flashcard" onClick={() => setFlipped(true)}>
          <div className="front">{card.term}</div>
          {flipped && (
            <div className="back">
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
                  📖 Xem định nghĩa từ điển
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
          {!flipped && <p className="hint">Nhấn hoặc bấm Space để lật đáp án</p>}
        </div>

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
            <p className="grade-hint">Phím tắt: 1 Quên · 2 Khó · 3 Nhớ · 4 Dễ</p>
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

