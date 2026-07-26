// "Thêm nhanh" — lượm một từ khi đang lướt web mà từ chưa có trong từ điển.
// Mở được ba đường: từ menu (form trống), từ bookmarklet trên máy tính và từ
// Share Target trên điện thoại (cả hai đưa từ vào qua ?add= → App mở form kèm sẵn
// mặt chữ). Gõ tay là mặc định; nút "AI điền" (khi đã đăng nhập) điền hộ nghĩa/
// đọc để sửa lại. Lưu xong đổ vào CẢ hai kho: hàng ôn SRS (onRecordSrs) và hộp
// thư lượm nhặt trong từ điển cá nhân (addToInbox) — dùng chung domain/customEntry.

import { useEffect, useMemo, useRef, useState } from "react";
import { LANG_PAIRS, LangPair } from "@/shared/languages";
import { buildAiPrompt, buildDictEntry, CustomDraft, emptyDraft, isDraftFilled, parseAiResponse } from "../../domain/customEntry";
import { guessPairForText } from "../../domain/quickadd";
import { generateVocab } from "../../data/aiGenerate";
import { addToInbox, INBOX_TITLE } from "../../data/inbox";
import "./quickadd.css";

/** Các trường tối thiểu để ghi một từ vào hàng ôn SRS (khớp recordLookup của store). */
export interface QuickAddRecord {
  term: string;
  term_lang: string;
  native_lang: string;
  meaning: string;
  reading?: string;
  pos?: string;
  is_custom?: boolean;
}

interface Props {
  /** Cặp ngôn ngữ đang chọn ở app — dùng khi mở form trống (không có từ gợi ý). */
  pair: LangPair;
  /** Mặt chữ điền sẵn (từ bookmarklet / Share Target). Rỗng khi mở từ menu. */
  initialTerm: string;
  loggedIn: boolean;
  onRequestLogin: () => void;
  /** Ghi từ vào hàng ôn SRS (thường là store.recordLookup). */
  onRecordSrs: (input: QuickAddRecord) => Promise<unknown>;
  onClose: () => void;
  /** Gọi sau mỗi lần lưu để app làm mới (đếm từ, đồng bộ, tra lại…). */
  onSaved?: () => void;
}

export function QuickAdd({ pair: appPair, initialTerm, loggedIn, onRequestLogin, onRecordSrs, onClose, onSaved }: Props) {
  // Có mặt chữ gợi ý thì đoán cặp theo chữ viết; không thì theo cặp đang tra ở app.
  const [pair, setPair] = useState<LangPair>(() => (initialTerm.trim() ? guessPairForText(initialTerm) : appPair));
  const [draft, setDraft] = useState<CustomDraft>(() => ({ ...emptyDraft(), term: initialTerm.trim() }));
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const set = <K extends keyof CustomDraft>(k: K, v: CustomDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const isJa = pair.source === "ja";
  const canSave = isDraftFilled(draft) && !saving;

  // Escape đóng form (checklist DESIGN §3 — overlay điều khiển được bằng bàn phím).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // AI điền hộ: dùng chung trình dựng prompt & phân tích với Từ điển cá nhân; chỉ
  // lấy mục đầu (thêm nhanh mỗi lần một từ). Giữ nguyên mặt chữ người dùng đã gõ.
  async function onAiFill() {
    if (!draft.term.trim()) {
      setStatus("Nhập mặt chữ trước đã.");
      return;
    }
    setAiBusy(true);
    setStatus("Đang nhờ AI điền…");
    try {
      const prompt = buildAiPrompt({
        words: [draft.term.trim()],
        randomCount: 0,
        wantExamples: true,
        wantExplanation: true,
        wantRelated: false,
        extra: "",
        pair,
      });
      const { rows, errors } = parseAiResponse(await generateVocab(prompt));
      const row = rows[0];
      if (!row) {
        setStatus(errors[0] ?? "AI không trả về từ nào.");
        return;
      }
      setDraft((d) => ({
        ...d,
        reading: row.reading || d.reading,
        pos: row.pos || d.pos,
        gloss: row.gloss || d.gloss,
        example: row.example || d.example,
        note: row.note || d.note,
      }));
      setStatus("AI đã điền — kiểm lại rồi lưu.");
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  async function onSave() {
    setSaving(true);
    setStatus("");
    try {
      const entry = buildDictEntry(draft, pair, INBOX_TITLE);
      // Đổ vào CẢ hai kho: hàng ôn (để ôn) + hộp thư lượm nhặt (để tra lại sau).
      await onRecordSrs({
        term: entry.term,
        term_lang: entry.term_lang,
        native_lang: entry.native_lang,
        meaning: JSON.stringify(entry.definitions),
        reading: entry.reading || undefined,
        pos: draft.pos.trim() || undefined,
        is_custom: true,
      });
      await addToInbox(pair, draft);
      const added = entry.term;
      // Sẵn sàng lượm từ tiếp: xoá form, giữ cặp ngôn ngữ, con trỏ về ô mặt chữ.
      setDraft(emptyDraft());
      setStatus(`Đã thêm “${added}” vào hàng ôn và “${INBOX_TITLE}”.`);
      termRef.current?.focus();
      onSaved?.();
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const termRef = useRef<HTMLInputElement>(null);

  return (
    <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manager-card qa-card" role="dialog" aria-modal="true" aria-label="Thêm nhanh một từ">
        <header className="manager-head">
          <h2>Thêm nhanh</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}>×</button>
        </header>

        <div className="manager-body">
          <div className="form-row">
            <label className="form-field">
              <span className="field-label">Cặp ngôn ngữ</span>
              <select
                value={pair.id}
                onChange={(e) => setPair(LANG_PAIRS.find((p) => p.id === e.target.value) ?? pair)}
              >
                {LANG_PAIRS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="form-field grow">
              <span className="field-label">Từ (mặt chữ)</span>
              <input
                ref={termRef}
                autoFocus={!initialTerm.trim()}
                lang={isJa ? "ja" : undefined}
                value={draft.term}
                onChange={(e) => set("term", e.target.value)}
                placeholder={isJa ? "勉強" : "serendipity"}
              />
            </label>
          </div>

          <div className="form-row">
            <label className="form-field">
              <span className="field-label">Cách đọc (tuỳ chọn)</span>
              <input
                lang={isJa ? "ja" : undefined}
                value={draft.reading}
                onChange={(e) => set("reading", e.target.value)}
                placeholder={isJa ? "べんきょう" : ""}
              />
            </label>
            <label className="form-field grow">
              <span className="field-label">Nghĩa (ngăn nhiều nghĩa bằng “;”)</span>
              <input
                autoFocus={!!initialTerm.trim()}
                value={draft.gloss}
                onChange={(e) => set("gloss", e.target.value)}
                placeholder="học tập; sự học"
              />
            </label>
          </div>

          <details className="qa-more">
            <summary>Thêm chi tiết (tuỳ chọn)</summary>
            <label className="form-field">
              <span className="field-label">Từ loại (mã, cách nhau bởi khoảng trắng)</span>
              <input value={draft.pos} onChange={(e) => set("pos", e.target.value)} placeholder="n vs" />
            </label>
            <label className="form-field">
              <span className="field-label">Ví dụ (“câu :: bản dịch”)</span>
              <input
                lang={isJa ? "ja" : undefined}
                value={draft.example}
                onChange={(e) => set("example", e.target.value)}
                placeholder="毎日勉強する :: Học mỗi ngày"
              />
            </label>
            <label className="form-field">
              <span className="field-label">Ghi chú cách dùng</span>
              <input value={draft.note} onChange={(e) => set("note", e.target.value)} />
            </label>
          </details>

          <div className="qa-actions">
            {loggedIn ? (
              <button type="button" className="link" disabled={aiBusy || !draft.term.trim()} onClick={onAiFill}>
                {aiBusy ? "Đang điền…" : "✨ AI điền hộ"}
              </button>
            ) : (
              <span className="muted qa-ai-hint">
                <button type="button" className="link" onClick={onRequestLogin}>Đăng nhập</button> để AI điền hộ nghĩa
              </span>
            )}
            <button type="button" className="primary" disabled={!canSave} onClick={onSave}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>

          {status && <p className="dict-status">{status}</p>}

          <QuickAddShortcut />
        </div>
      </div>
    </div>
  );
}

/**
 * Hướng dẫn lối tắt lượm từ khi KHÔNG ở trong app: kéo bookmarklet lên thanh dấu
 * trang (máy tính) hoặc dùng "Chia sẻ → Gioitu" (điện thoại). Bookmarklet dựng từ
 * origin hiện tại; href gắn qua ref để React không quét bỏ chuỗi `javascript:`.
 */
function QuickAddShortcut() {
  const bookmarklet = useMemo(() => {
    const origin = window.location.origin;
    return (
      "javascript:(function(){var s=(''+(window.getSelection?window.getSelection():'')).trim();" +
      "var t=s||window.prompt('Từ cần thêm vào Gioitu:','');" +
      `if(t)window.open('${origin}/?add='+encodeURIComponent(t),'gioitu-add','width=520,height=680');})();`
    );
  }, []);

  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    linkRef.current?.setAttribute("href", bookmarklet);
  }, [bookmarklet]);

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <details className="qa-shortcut">
      <summary>Lối tắt để thêm khi đang lướt web</summary>
      <p className="muted">
        <b>Máy tính:</b> kéo nút dưới đây lên thanh dấu trang; khi gặp từ, bôi đen rồi bấm nó.
      </p>
      <div className="qa-shortcut-row">
        <a ref={linkRef} className="qa-bookmarklet" draggable onClick={(e) => e.preventDefault()}>
          ＋ Gioitu
        </a>
        <button type="button" className="link" onClick={copy}>
          {copied ? "Đã sao chép" : "Sao chép mã"}
        </button>
      </div>
      <p className="muted">
        <b>Điện thoại:</b> bôi đen chữ ở bất kỳ app nào → <b>Chia sẻ</b> → chọn <b>Gioitu</b>.
      </p>
    </details>
  );
}
