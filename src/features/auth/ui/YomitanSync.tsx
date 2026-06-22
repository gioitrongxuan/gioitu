// "Kết nối Yomitan" setup modal: shows the endpoint URL and the user's stable
// API key (with copy + regenerate) plus the steps to paste them into Yomitan's
// Anki settings. Pressing "+" in Yomitan then saves the word into gioitu.
//
// Requires a signed-in account: notes must be attributed to a user, and a guest
// has no cloud identity — so guests are shown a prompt to sign in instead.

import { useEffect, useState } from "react";
import { getYomitanKey, regenerateYomitanKey } from "../data/auth";

interface Props {
  loggedIn: boolean;
  onRequestLogin: () => void;
  onClose: () => void;
}

// The endpoint to paste into Yomitan. Built from the current origin so it is
// correct whether the app runs on localhost or a deployed domain.
const ENDPOINT = `${window.location.origin}/api/yomitan-sync`;

export function YomitanSync({ loggedIn, onRequestLogin, onClose }: Props) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    getYomitanKey()
      .then((r) => alive && setApiKey(r.api_key))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [loggedIn]);

  async function regenerate() {
    if (!window.confirm("Tạo khóa mới sẽ làm khóa cũ ngừng hoạt động. Tiếp tục?")) return;
    setError(null);
    try {
      const r = await regenerateYomitanKey();
      setApiKey(r.api_key);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-label="Kết nối Yomitan">
        <header className="manager-head">
          <h2>Kết nối Yomitan</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}>×</button>
        </header>

        {!loggedIn ? (
          <section className="theme-section">
            <p className="yk-hint">
              Cần đăng nhập để kết nối Yomitan — từ bạn lưu sẽ vào đúng tài khoản của bạn.
            </p>
            <button type="button" className="primary" onClick={onRequestLogin}>
              Đăng nhập
            </button>
          </section>
        ) : (
          <>
            <p className="yk-hint">
              Trỏ Yomitan về địa chỉ này, dán Khóa API, rồi bấm dấu <strong>+</strong> khi tra
              từ để lưu vào gioitu.
            </p>

            <section className="theme-section">
              <h3>Địa chỉ máy chủ (Server)</h3>
              <CopyRow value={ENDPOINT} />
            </section>

            <section className="theme-section">
              <h3>Khóa API</h3>
              <CopyRow value={apiKey ?? "Đang tải…"} disabled={!apiKey} mono />
              <button type="button" className="link" onClick={regenerate} disabled={!apiKey}>
                Tạo khóa mới
              </button>
            </section>

            {error && <p className="yk-error">{error}</p>}

            <section className="theme-section">
              <h3>Cài trong Yomitan</h3>
              <ol className="yk-steps">
                <li>Mở Yomitan → <em>Settings → Anki</em>, bật <em>Enable Anki integration</em>.</li>
                <li>Dán <em>Địa chỉ máy chủ</em> ở trên vào ô <em>Server</em>.</li>
                <li>Mở phần nâng cao và dán <em>Khóa API</em> vào ô <em>API key</em>.</li>
                <li>Chọn Deck và Type/Model là <em>Website Database</em>.</li>
                <li>
                  Map các trường: <em>Word</em> ← {"{expression}"}, <em>Reading</em> ←{" "}
                  {"{reading}"}, <em>Glossary</em> ← {"{glossary}"}, <em>Sentence</em> ←{" "}
                  {"{sentence}"}.
                </li>
              </ol>
            </section>
          </>
        )}

        <footer className="theme-actions">
          <button type="button" className="primary" onClick={onClose}>Xong</button>
        </footer>
      </div>
    </div>
  );
}

/** A read-only value with a copy button; shows "Đã chép" briefly on success. */
function CopyRow({ value, disabled, mono }: { value: string; disabled?: boolean; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked (insecure origin); the user can still select.
    }
  }

  return (
    <div className="url-row">
      <input
        className={`url-input${mono ? " yk-mono" : ""}`}
        value={value}
        readOnly
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className="primary yk-copy" onClick={copy} disabled={disabled}>
        {copied ? "Đã chép" : "Sao chép"}
      </button>
    </div>
  );
}
