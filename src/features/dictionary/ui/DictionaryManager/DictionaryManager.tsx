// Dictionary management screen (server-backed). Hosts two tabs — import/list
// (ImportTab) and browse/edit meanings (EditTab) — for the shared server
// dictionary, so it requires a signed-in user. Each tab lives in its own file.

import { useState } from "react";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon } from "@/shared/ui/icons";
import { LangPair, DEFAULT_PAIR } from "@/shared/languages";
import { PairSelect } from "./PairSelect";
import { ImportTab } from "./ImportTab";
import { EditTab } from "./EditTab";

interface Props {
  /** Set when signed in; management requires it. */
  loggedIn: boolean;
  onRequestLogin: () => void;
  onClose: () => void;
  /** Mở thẳng tab sửa với từ đang xem (đi từ nút "Sửa từ" trên kết quả tra). */
  initialEdit?: { pair: LangPair; query: string };
}

type Tab = "import" | "edit";

export function DictionaryManager({ loggedIn, onRequestLogin, onClose, initialEdit }: Props) {
  const [tab, setTab] = useState<Tab>(initialEdit ? "edit" : "import");
  const [pair, setPair] = useState<LangPair>(initialEdit?.pair ?? DEFAULT_PAIR);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  return (
    <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manager-card" role="dialog" aria-modal="true" aria-label="Quản lý từ điển" tabIndex={-1} ref={dialogRef}>
        <header className="manager-head">
          <h2>Quản lý từ điển</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        {!loggedIn ? (
          <div className="manager-gate">
            <p className="muted">Bạn cần đăng nhập để nhập và chỉnh sửa từ điển trên máy chủ.</p>
            <button className="primary" onClick={onRequestLogin}>Đăng nhập</button>
          </div>
        ) : (
          <>
            <div className="manager-tabs">
              <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>
                Nhập & danh sách
              </button>
              <button className={tab === "edit" ? "active" : ""} onClick={() => setTab("edit")}>
                Tra cứu & sửa nghĩa
              </button>
            </div>

            <PairSelect pair={pair} onChange={setPair} />
            {error && <p className="auth-error">{error}</p>}

            {tab === "import" ? (
              <ImportTab pair={pair} onError={setError} />
            ) : (
              <EditTab pair={pair} onError={setError} initialQuery={initialEdit?.query} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
