// Màn duyệt đề xuất từ điển chung (#70 — 6.1), chỉ admin. Liệt kê đề xuất chờ
// duyệt và cho Duyệt (vào từ điển hệ thống) hoặc Từ chối từng cái.

import { useEffect, useState } from "react";
import {
  Proposal,
  listPendingProposals,
  approveProposal,
  rejectProposal,
} from "../data/contribute";

export function ContributionReview({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listPendingProposals()
      .then((p) => alive && setItems(p))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  async function act(id: string, fn: (id: string) => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await fn(id);
      setItems((list) => (list ?? []).filter((p) => p.id !== id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-label="Duyệt đề xuất">
        <header className="manager-head">
          <h2>Duyệt đề xuất</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}>×</button>
        </header>

        <section className="theme-section">
          {error && <p className="yk-error">{error}</p>}
          {!items && !error && <p className="yk-hint">Đang tải…</p>}
          {items && items.length === 0 && <p className="yk-hint">Không có đề xuất nào đang chờ.</p>}
          {items && items.length > 0 && (
            <ul className="proposal-list">
              {items.map((p) => (
                <li key={p.id} className="proposal">
                  <div className="proposal-body">
                    <span className="proposal-head" lang={p.term_lang}>
                      {p.term}
                      {p.reading ? ` (${p.reading})` : ""}
                    </span>
                    <span className="ld-meta">{p.term_lang}→{p.native_lang}{p.pos.length ? ` · ${p.pos.join(", ")}` : ""}</span>
                    <span className="proposal-gloss">{p.gloss.join("; ")}</span>
                  </div>
                  <div className="proposal-acts">
                    <button className="link" disabled={busyId === p.id} onClick={() => act(p.id, approveProposal)}>
                      Duyệt
                    </button>
                    <button className="link danger" disabled={busyId === p.id} onClick={() => act(p.id, rejectProposal)}>
                      Từ chối
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="theme-actions">
          <button type="button" className="primary" onClick={onClose}>Xong</button>
        </footer>
      </div>
    </div>
  );
}
