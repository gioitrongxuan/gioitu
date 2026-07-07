// Detail panel — a Yomitan-style definition view. For each matched dictionary
// entry it shows the headword with furigana, its part-of-speech tags, the chain
// of inflection reasons that led there (食べた → 食べる: quá khứ), and the
// structured-content glossary grouped by sense. Falls back to a Custom
// Definition editor when nothing is found, and surfaces the SRS stats.

import { useEffect, useRef, useState } from "react";
import { TermResult } from "../data/search";
import { VocabEntry } from "@/shared/types";
import { setTermVerified } from "../data/dictAdmin";
import { reasonLabel } from "../domain/deinflect";
import { Definitions } from "./Definitions";
import { ImageGallery, CommentList } from "./Media";
import { PitchView, Pronunciations } from "./PitchView";
import { TagChip, HeadwordBadges, FrequencyTags } from "./TagChip";
import { Furigana } from "@/shared/ui/Furigana";
import { isCodePointKanji } from "@/shared/japanese";
import { MOBILE_MEDIA_QUERY, useMediaQuery } from "@/shared/ui/useMediaQuery";
import { MeaningView, meaningToLines } from "@/shared/ui/MeaningView";
import { AddToListButton } from "@/features/studylist/ui/AddToListButton";
import { KanjiBreakdown } from "./KanjiPanel";

interface Props {
  /** The text the user searched (surface form). */
  term: string;
  /** Ngôn ngữ của truy vấn (để biết có thể phân tích chữ Hán hay không). */
  term_lang: string;
  /** Ngôn ngữ nghĩa (đích), truyền cho phân tích chữ Hán. */
  native_lang: string;
  /** Dictionary results (deinflected + ranked). May be empty. */
  results: TermResult[];
  /** The user's learning entry for the primary term, if any. */
  entry?: VocabEntry;
  onSaveCustom: (meaning: string) => void;
  onClose: () => void;
  /** Navigate to another term (internal `?query=` links). */
  onLookup?: (term: string) => void;
  /** Add one shown result to the history map ("+"), exact or fuzzy. */
  onAddResult?: (res: TermResult) => void;
  /** Mark the word as already known → LEARNED. */
  onMarkKnown?: (entry: VocabEntry) => void;
  /**
   * Mark a term that has no learning entry yet as already known — used for a
   * single kanji opened from the stats grid, so it can join "đã thuộc" without a
   * prior lookup. Creates the entry straight in the LEARNED state.
   */
  onMarkKnownNew?: (term: string, term_lang: string, native_lang: string) => void;
  /** Mark a learned word as forgotten → relapse into the review queue. */
  onMarkForgotten?: (entry: VocabEntry) => void;
  /** Delete the word (tombstone). */
  onDelete?: (entry: VocabEntry) => void;
  /** Admin từ điển: hiện nút Duyệt/Sửa trên kết quả server. */
  isAdmin?: boolean;
  /** Mở trình quản lý từ điển tại đúng từ đang xem (chỉ admin). */
  onAdminEdit?: (term: string) => void;
  /** Người dùng đã đăng nhập (để hiện nút đề xuất lên từ điển chung). */
  loggedIn?: boolean;
  /** Đề xuất một kết quả lên từ điển hệ thống (#70 — 6.1). */
  onPropose?: (res: TermResult) => void;
}

export function DetailPanel({
  term,
  term_lang,
  native_lang,
  results,
  entry,
  onSaveCustom,
  onClose,
  onLookup,
  onAddResult,
  onMarkKnown,
  onMarkKnownNew,
  onMarkForgotten,
  onDelete,
  isAdmin,
  onAdminEdit,
  loggedIn,
  onPropose,
}: Props) {
  // Mobile: panel là bottom sheet phủ lên cloud — khoá cuộn body để kéo trong
  // sheet không cuộn luôn nội dung phía sau (desktop panel nằm cạnh, không khoá).
  const isSheet = useMediaQuery(MOBILE_MEDIA_QUERY);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isSheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isSheet]);

  // Desktop: panel là `position: sticky; top: 16px`. Yêu cầu: cuộn cả trang
  // trước, khi panel dính lên mép trên mới cuộn nội bộ. Trước đây ta chặn sự kiện
  // wheel rồi tự `window.scrollBy` — nhưng chặn wheel rồi cuộn thủ công lệch pha
  // với cuộn native, đặc biệt momentum trackpad macOS, gây giật. Cách này không
  // chặn wheel: panel KHÔNG phải scroll container khi chưa dính (CSS overflow:
  // visible) nên wheel native cuộn trang mượt; khi panel dính (top ≤ 16px) ta bật
  // class `stuck` → CSS giới hạn chiều cao + overflow: auto → cuộn nội bộ, overscroll
  // chuyền tiếp ra trang. Theo dõi trạng thái dính bằng scroll/resize passive + rAF.
  useEffect(() => {
    if (isSheet) return; // chỉ cho panel desktop (sticky), không áp dụng cho sheet mobile
    const panel = panelRef.current;
    if (!panel) return;
    // Khớp `top: 16px` trong styles.css (.detail-panel ở breakpoint desktop).
    const STICKY_TOP = 16;
    let raf = 0;
    const sync = () => {
      raf = 0;
      panel.classList.toggle("stuck", panel.getBoundingClientRect().top <= STICKY_TOP + 0.5);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(sync); };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    // Nội dung panel đổi (đổi từ tra) cũng đổi chiều cao → cần cập nhật lại trạng
    // thái dính, ví dụ khi panel vừa ngắn đi thì có thể hết dính.
    const ro = new ResizeObserver(schedule);
    ro.observe(panel);
    sync();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isSheet]);

  // Nghĩa cá nhân đã lưu và định nghĩa từ điển không còn loại trừ nhau: bấm một
  // thẻ cho ra dữ liệu cá nhân trước, rồi tới dữ liệu trong các từ điển.
  const savedLines = entry ? meaningToLines(entry.meaning) : [];
  const hasSaved = savedLines.length > 0;
  const hasResults = results.length > 0;

  // Một kanji đơn (tra từ lưới thống kê hoặc gõ thẳng) chưa có trong lịch sử: cho
  // đánh dấu "đã biết" ngay tại chỗ để nó vào "đã thuộc" mà không cần tra trước.
  const isLoneKanji =
    term_lang === "ja" && [...term].length === 1 && isCodePointKanji(term.codePointAt(0) ?? 0);
  const canMarkKnownNew = !entry && isLoneKanji && onMarkKnownNew != null;

  return (
    <>
      {/* Lớp che sau sheet (chỉ hiện trên mobile — desktop ẩn qua CSS): chặn
          chạm xuyên xuống cloud/filter, chạm vào thì đóng panel. */}
      <div className="detail-backdrop" aria-hidden="true" onClick={onClose} />
      <aside ref={panelRef} className="detail-panel" aria-label="Chi tiết từ">
        <header>
          <h2>
            {/* Hiện furigana khi từ trên tiêu đề đúng là từ của entry (bấm thẻ,
                hoặc tra trúng dạng gốc). Không phụ thuộc results để tránh "lật"
                mất furigana khi định nghĩa từ điển tra xong về sau. Khi tra một
                dạng chia (term bề mặt khác entry.term) thì hiện nguyên chữ đã gõ. */}
            {entry?.reading && entry.term === term ? (
              <Furigana term={entry.term} reading={entry.reading} lang={entry.term_lang} />
            ) : (
              term
            )}
          </h2>
          <button className="link close" onClick={onClose}>✕</button>
        </header>

        {/* Thanh SRS một hàng ngay đầu panel: trạng thái (tag màu) + số lần tra,
            kèm nút Đã nhớ/Đã quên và Xoá — thấy và thao tác được mà không phải
            cuộn xuống cuối, dù định nghĩa dài đến đâu. */}
        {entry && (
          <div className="srs-bar">
            <span className={`srs-status ${statusVariant(entry)}`}>{statusLabel(entry)}</span>
            <span className="srs-count" title="Số lần tra">tra <b>{entry.lookup_count}</b></span>
            <span className="srs-acts">
              {entry.status === "LEARNED"
                ? onMarkForgotten && (
                    <button className="srs-act" title="Đánh dấu đã quên" aria-label="Đã quên"
                      onClick={() => onMarkForgotten(entry)}>↺</button>
                  )
                : onMarkKnown && (
                    <button className="srs-act" title="Đánh dấu đã nhớ" aria-label="Đã nhớ"
                      onClick={() => onMarkKnown(entry)}>✓</button>
                  )}
              {onDelete && (
                <button
                  className="srs-act danger"
                  title="Xoá từ"
                  aria-label="Xoá"
                  onClick={() => {
                    if (confirm(`Xoá từ “${entry.term}”? Toàn bộ tiến độ học sẽ mất.`)) onDelete(entry);
                  }}
                >
                  🗑
                </button>
              )}
            </span>
          </div>
        )}

        {/* Kanji chưa học: một hàng gọn cho phép ghi nhận "đã biết" ngay. */}
        {canMarkKnownNew && (
          <div className="srs-bar">
            <span className="srs-status neutral">Chưa học</span>
            <button
              className="srs-mark-known"
              onClick={() => onMarkKnownNew!(term, term_lang, native_lang)}
            >
              ✓ Đánh dấu đã biết
            </button>
          </div>
        )}

        {/* Dữ liệu cá nhân: nghĩa người dùng đã lưu. Chỉ gắn nhãn khi có kèm
            phần từ điển bên dưới, để màn tra thường không bị rối. */}
        {hasSaved && entry && (
          <div className="saved-meaning">
            {hasResults && <p className="section-label">Ghi chú của bạn</p>}
            {/* key theo từ: đổi thẻ thì trạng thái "Xem thêm" reset lại. */}
            <MeaningView
              key={entry.term}
              pos={entry.pos}
              meaning={entry.meaning}
              example={entry.example}
              analysis={entry.sentence_analysis}
              compact
            />
          </div>
        )}

        {/* Dữ liệu trong các từ điển. */}
        {hasResults ? (
          <div className="results">
            {hasSaved && <p className="section-label">Trong từ điển</p>}
            {results.map((res, i) => (
              <div key={i}>
                {/* Separate near-misses from the real matches above them. */}
                {res.fuzzy && !results[i - 1]?.fuzzy && (
                  <p className="fuzzy-divider muted">Có phải bạn muốn tìm:</p>
                )}
                <ResultView
                  res={res}
                  onLookup={onLookup}
                  onAdd={onAddResult}
                  isAdmin={isAdmin}
                  onAdminEdit={onAdminEdit}
                  loggedIn={loggedIn}
                  onPropose={onPropose}
                />
              </div>
            ))}
          </div>
        ) : hasSaved ? null : (
          // key theo từ: đổi truy vấn thì trạng thái tra kanji reset sạch, không
          // để số kanji cũ chớp lên trước khi tra lại.
          <NoMatch
            key={term}
            term={term}
            termLang={term_lang}
            nativeLang={native_lang}
            onLookup={onLookup}
            onSaveCustom={onSaveCustom}
          />
        )}

      </aside>
    </>
  );
}

/**
 * Không có mục từ vựng nào khớp. Với truy vấn tiếng Nhật, chữ Hán trong truy vấn
 * vẫn có thể tra được (kanji nằm ở CSDL riêng, độc lập với nguồn từ điển): hiện
 * phân tích chữ Hán kèm từ ví dụ (những từ CHỨA kanji) thay vì chỉ báo "không tìm
 * thấy". Chỉ khi không có kanji nào (từ thuần kana, tiếng Anh, offline…) mới mời
 * người dùng tự định nghĩa.
 */
function NoMatch({
  term,
  termLang,
  nativeLang,
  onLookup,
  onSaveCustom,
}: {
  term: string;
  termLang: string;
  nativeLang: string;
  onLookup?: (term: string) => void;
  onSaveCustom: (meaning: string) => void;
}) {
  const isJapanese = termLang === "ja";
  // null = đang tra kanji (chưa biết); số = số kanji tìm được. Truy vấn không phải
  // tiếng Nhật thì chắc chắn không có phần chữ Hán → coi như 0 ngay.
  const [kanjiCount, setKanjiCount] = useState<number | null>(isJapanese ? null : 0);
  const [custom, setCustom] = useState("");

  const resolvingKanji = isJapanese && kanjiCount === null;
  const hasKanji = (kanjiCount ?? 0) > 0;

  return (
    <>
      {isJapanese && (
        <KanjiBreakdown
          term={term}
          src={termLang}
          tgt={nativeLang}
          onLookup={onLookup}
          onResolved={setKanjiCount}
          autoExamples
        />
      )}

      {/* Chờ tra kanji xong mới quyết định lời mời, tránh chớp "không tìm thấy"
          rồi mới hiện chữ Hán. Còn tự định nghĩa vẫn luôn khả dụng. */}
      {!resolvingKanji && (
        <div className="custom-def">
          <p className="muted">
            {hasKanji ? "Chưa có mục từ vựng. Tự định nghĩa từ này:" : "Không tìm thấy. Tự định nghĩa từ này:"}
          </p>
          <textarea
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Nhập nghĩa của bạn…"
            rows={4}
          />
          <button className="primary" disabled={!custom.trim()} onClick={() => onSaveCustom(custom.trim())}>
            Lưu định nghĩa
          </button>
        </div>
      )}
    </>
  );
}

function ResultView({
  res,
  onLookup,
  onAdd,
  isAdmin,
  onAdminEdit,
  loggedIn,
  onPropose,
}: {
  res: TermResult;
  onLookup?: (term: string) => void;
  onAdd?: (res: TermResult) => void;
  isAdmin?: boolean;
  onAdminEdit?: (term: string) => void;
  loggedIn?: boolean;
  onPropose?: (res: TermResult) => void;
}) {
  const { entry } = res;
  // Local-only: once added we flip to a checkmark so the click reads as done.
  const [added, setAdded] = useState(false);
  // Cờ kiểm duyệt đến từ server; admin toggle tại chỗ nên giữ state cục bộ.
  const [verified, setVerified] = useState(entry.verified === true);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [proposed, setProposed] = useState(false);
  // Chỉ kết quả từ nguồn server mới có wordId — nguồn local (Yomitan) không duyệt được.
  const canModerate = isAdmin === true && Boolean(entry.wordId);

  async function toggleVerified() {
    if (!entry.wordId) return;
    setVerifyBusy(true);
    setAdminError(null);
    try {
      const resp = await setTermVerified(entry.wordId, !verified);
      setVerified(resp.verified);
    } catch (err) {
      setAdminError((err as Error).message);
    } finally {
      setVerifyBusy(false);
    }
  }

  return (
    <section className="result">
      <div className="result-head">
        <span className="headword">
          <Furigana term={entry.term} reading={entry.reading} lang={entry.term_lang} />
        </span>
        {verified && (
          <span className="verified-badge" title="Từ đã được kiểm duyệt">✓</span>
        )}
        {entry.dictionary && <span className="dict-name">{entry.dictionary}</span>}
        {onAdd && (
          <button
            className="link add-result"
            title={added ? "Đã thêm vào lịch sử" : "Thêm vào lịch sử"}
            aria-label="Thêm vào lịch sử"
            disabled={added}
            onClick={() => {
              onAdd(res);
              setAdded(true);
            }}
          >
            {added ? "✓" : "+"}
          </button>
        )}
      </div>

      <HeadwordBadges hanViet={entry.hanViet} jlpt={entry.jlpt} />

      <FrequencyTags frequencies={res.frequencies} />

      {/* Kiểm duyệt nội dung — chỉ admin, chỉ kết quả server. */}
      {canModerate && (
        <div className="admin-actions">
          <button className="link" disabled={verifyBusy} onClick={toggleVerified}>
            {verified ? "Bỏ duyệt" : "✓ Duyệt từ này"}
          </button>
          {onAdminEdit && (
            <button className="link" onClick={() => onAdminEdit(entry.term)}>Sửa từ</button>
          )}
          {adminError && <span className="danger">{adminError}</span>}
        </div>
      )}

      <AddToListButton
        word={{
          term: entry.term,
          reading: entry.reading,
          term_lang: entry.term_lang,
          native_lang: entry.native_lang,
        }}
      />

      {onPropose && loggedIn && (
        <button
          className="link propose-btn"
          disabled={proposed}
          title="Gợi ý từ này cho từ điển dùng chung (admin sẽ duyệt)"
          onClick={() => {
            onPropose(res);
            setProposed(true);
          }}
        >
          {proposed ? "Đã đề xuất ✓" : "Đề xuất lên hệ thống"}
        </button>
      )}

      {res.reasons.length > 0 && (
        <div className="reasons" title="Cách chia của từ gốc">
          <span className="reasons-base" lang="ja">{entry.term}</span>
          {res.reasons.map((r, i) => (
            <span key={i} className="reason-chip">{reasonLabel(r)}</span>
          ))}
        </div>
      )}

      {entry.termTags && entry.termTags.length > 0 && (
        <div className="term-tags">
          {entry.termTags.map((t) => (
            <TagChip key={t} code={t} meta={entry.tagMeta?.[t]} kind="term" />
          ))}
        </div>
      )}

      {res.pronunciations && res.pronunciations.length > 0 && (
        <Pronunciations pronunciations={res.pronunciations} />
      )}
      <PitchView pitch={entry.pitch} />

      <Definitions
        senses={entry.senses}
        definitions={entry.definitions}
        tagMeta={entry.tagMeta}
        onLookup={onLookup}
      />

      <ImageGallery images={entry.images} />
      <CommentList comments={entry.comments} />

      {/* Phân tích chữ Hán — chỉ với từ tiếng Nhật (kanji là dữ liệu server). */}
      {entry.term_lang === "ja" && (
        <KanjiBreakdown term={entry.term} src={entry.term_lang} tgt={entry.native_lang} onLookup={onLookup} />
      )}
    </section>
  );
}

function statusLabel(entry: VocabEntry): string {
  // A word with no card yet has only been seen, not committed to the queue.
  if (entry.card_state == null) return "Chưa ôn";
  const s = entry.status;
  return s === "LEARNED" ? "Đã thuộc" : s === "RELAPSED" ? "Tái quên" : "Đang học";
}

/** Màu của tag trạng thái — nhìn màu là biết tình trạng, đỡ phải đọc chữ. */
function statusVariant(entry: VocabEntry): string {
  if (entry.card_state == null) return "neutral";
  const s = entry.status;
  return s === "LEARNED" ? "learned" : s === "RELAPSED" ? "relapsed" : "learning";
}

