// Modal chia sẻ tạm một từ điển (#70 — 5.2): đóng gói .zip Yomitan, tải lên và
// hiện link kèm đồng hồ đếm ngược 5:00 để nhắc người gửi rằng link sẽ tự hết hạn.

import { useEffect, useState } from "react";
import { exportDictAsZip } from "@/features/dictionary/data/yomitanZip";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon } from "@/shared/ui/icons";
import { createShareLink, ShareLink } from "../data/share";

interface Props {
  loggedIn: boolean;
  dict: { id: string; title: string };
  onRequestLogin: () => void;
  onClose: () => void;
}

export function ShareDialog({ loggedIn, dict, onRequestLogin, onClose }: Props) {
  const [link, setLink] = useState<ShareLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Đóng gói + tải lên khi mở (nếu đã đăng nhập).
  useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    (async () => {
      try {
        const { blob, filename } = await exportDictAsZip(dict.id);
        const created = await createShareLink(blob, filename);
        if (alive) setLink(created);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loggedIn, dict.id]);

  // Đếm ngược tới hạn.
  useEffect(() => {
    if (!link) return;
    const tick = () => setRemaining(Math.max(0, Math.round((link.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [link]);

  const expired = remaining === 0;
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard có thể bị chặn (origin không bảo mật) — người dùng vẫn chọn tay được.
    }
  }

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-modal="true" aria-label="Chia sẻ từ điển" tabIndex={-1} ref={dialogRef}>
        <header className="manager-head">
          <h2>Chia sẻ “{dict.title}”</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        {!loggedIn ? (
          <section className="theme-section">
            <p className="yk-hint">Cần đăng nhập để tạo link chia sẻ tạm.</p>
            <button type="button" className="primary" onClick={onRequestLogin}>Đăng nhập</button>
          </section>
        ) : (
          <section className="theme-section">
            <p className="yk-hint">
              Link tải file <strong>.zip Yomitan</strong> của từ điển này, tự hết hạn sau 5 phút.
            </p>

            {error && <p className="yk-error">{error}</p>}

            {!link && !error && <p className="yk-hint">Đang chuẩn bị link…</p>}

            {link && (
              <>
                <div className="url-row">
                  <input className="url-input" value={link.url} readOnly onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="primary" onClick={copy} disabled={expired}>
                    {copied ? "Đã chép" : "Sao chép"}
                  </button>
                </div>
                <p className={expired ? "yk-error" : "share-countdown"}>
                  {expired ? "Link đã hết hạn." : `Hết hạn sau ${formatRemaining(remaining ?? 0)}`}
                </p>
              </>
            )}
          </section>
        )}

        <footer className="theme-actions">
          <button type="button" className="primary" onClick={onClose}>Xong</button>
        </footer>
      </div>
    </div>
  );
}

function formatRemaining(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
