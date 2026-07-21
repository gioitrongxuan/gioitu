// Menu ☰: gom các action phụ của header vào một dropdown để khỏi tràn dòng
// trên header. Hiện ở mọi bề rộng — không có hàng nút desktop riêng.

import { useState } from "react";
import { LockIcon, MenuIcon } from "@/shared/ui/icons";

export interface MenuItem {
  label: string;
  run: () => void;
  /** Cần đăng nhập mới dùng được: hiện ổ khoá + gợi ý, thay vì giấu hay chặn bất ngờ. */
  locked?: boolean;
}

export function HeaderMenu({ items, email }: { items: MenuItem[]; email: string | null }) {
  const [open, setOpen] = useState(false);

  const pick = (run: () => void) => {
    setOpen(false);
    run();
  };

  return (
    <div className="header-menu">
      <button
        type="button"
        className="menu-button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MenuIcon />
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="header-menu-panel" role="menu">
            <div className="user-email">{email ?? "Khách"}</div>
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className="link menu-item"
                role="menuitem"
                onClick={() => pick(item.run)}
                aria-label={item.locked ? `${item.label} — cần đăng nhập` : undefined}
                title={item.locked ? "Cần đăng nhập" : undefined}
              >
                <span className="menu-item-label">{item.label}</span>
                {item.locked && <LockIcon className="menu-lock" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
