// Trang giá trị "Premium" (#165, gốc #70): thay vì chỉ một ô nhập mã, màn này
// kể trước NGƯỜI DÙNG ĐƯỢC GÌ — các giá trị xoay quanh retention (giữ lại tiến
// độ và lịch sử học) — rồi mới tới phần kích hoạt. Lợi ích hiện cho cả khách:
// trang giá trị phải đọc được TRƯỚC khi bị đòi đăng nhập.
// Admin sinh + xem danh sách mã như cũ. Kích hoạt yêu cầu đăng nhập — Premium
// gắn với tài khoản.

import { useEffect, useState } from "react";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon } from "@/shared/ui/icons";
import {
  redeemPremiumCode,
  generatePremiumCodes,
  listPremiumCodes,
  PremiumCode,
} from "../data/premium";
import "./premium.css";

interface Props {
  loggedIn: boolean;
  isAdmin: boolean;
  isPremium: boolean;
  /** Gọi sau khi kích hoạt thành công để phiên/UI phản ánh trạng thái Premium. */
  onActivated: () => void;
  onRequestLogin: () => void;
  onClose: () => void;
}

/** Một lợi ích Premium: tên + nó giúp gì cho việc GIỮ kiến thức, và mở ở đâu. */
const BENEFITS: { title: string; detail: string }[] = [
  {
    title: "Thống kê nâng cao",
    detail:
      "Tỉ lệ nhớ tách theo khoảng ôn (thẻ non vs thẻ chín) và tải toàn bộ lịch sử " +
      "ôn ra CSV để tự phân tích — trong ☰ → Thống kê ôn tập.",
  },
  {
    title: "Sao lưu kèm lịch sử ôn",
    detail:
      "Tệp “Xuất dữ liệu học” chứa cả nhật ký từng lượt ôn, không chỉ trạng thái " +
      "hiện tại — nhập lại là khôi phục nguyên vẹn quá khứ học trên máy mới.",
  },
  {
    title: "Đồng bộ từ điển cá nhân",
    detail:
      "Các bộ từ tự soạn (kể cả bằng AI) theo bạn qua mọi thiết bị. Tiến độ học " +
      "(SRS) vẫn đồng bộ miễn phí như thường.",
  },
  {
    title: "AI phân tích câu ví dụ",
    detail:
      "Câu ví dụ thêm qua Yomitan được Deepseek chú giải cách dùng từ + nghĩa cả " +
      "câu, hiện ngay trong phiên ôn.",
  },
];

export function PremiumModal({ loggedIn, isAdmin, isPremium, onActivated, onRequestLogin, onClose }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(isPremium);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  async function redeem() {
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await redeemPremiumCode(value);
      setDone(true);
      setCode("");
      onActivated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-modal="true" aria-label="Premium" tabIndex={-1} ref={dialogRef}>
        <header className="manager-head">
          <h2>Premium</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        <p className="pm-intro">
          Premium chăm phần <strong>giữ lại</strong> của việc học: hiểu mình nhớ đến đâu,
          không bao giờ mất lịch sử, và mang được kho từ của mình đi bất cứ đâu.
        </p>

        <ul className="pm-benefits">
          {BENEFITS.map((b) => (
            <li key={b.title}>
              <h3>{b.title}</h3>
              <p>{b.detail}</p>
            </li>
          ))}
        </ul>

        {!loggedIn ? (
          <section className="theme-section">
            <h3>Kích hoạt</h3>
            <p className="yk-hint">Cần đăng nhập để kích hoạt Premium cho tài khoản của bạn.</p>
            <button type="button" className="primary" onClick={onRequestLogin}>Đăng nhập</button>
          </section>
        ) : done ? (
          <section className="theme-section">
            <p className="premium-status">✓ Tài khoản đã kích hoạt Premium.</p>
          </section>
        ) : (
          <section className="theme-section">
            <h3>Nhập mã kích hoạt</h3>
            <div className="url-row">
              <input
                className="url-input"
                placeholder="VD: ABCD-EFGH-JKMN"
                value={code}
                disabled={busy}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && redeem()}
              />
              <button className="primary" disabled={busy || !code.trim()} onClick={redeem}>
                Kích hoạt
              </button>
            </div>
            {error && <p className="yk-error">{error}</p>}
          </section>
        )}

        {loggedIn && isAdmin && <AdminCodes />}

        <footer className="theme-actions">
          <button type="button" className="primary" onClick={onClose}>Xong</button>
        </footer>
      </div>
    </div>
  );
}

/** Khu admin: sinh mã mới và xem trạng thái các mã đã cấp. */
function AdminCodes() {
  const [codes, setCodes] = useState<PremiumCode[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listPremiumCodes()
      .then((c) => alive && setCodes(c))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await generatePremiumCodes(5);
      setCodes(await listPremiumCodes());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="theme-section">
      <h3>Mã kích hoạt (admin)</h3>
      <button type="button" className="link" onClick={generate} disabled={busy}>
        {busy ? "Đang tạo…" : "Tạo 5 mã mới"}
      </button>
      {error && <p className="yk-error">{error}</p>}
      {codes && codes.length > 0 && (
        <ul className="premium-code-list">
          {codes.map((c) => (
            <li key={c.code}>
              <code className={c.redeemed_by ? "used" : ""}>{c.code}</code>
              <span className="ld-meta">{c.redeemed_by ? "đã dùng" : "chưa dùng"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
