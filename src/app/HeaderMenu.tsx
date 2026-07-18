// Menu ☰: gom các action phụ của header vào một dropdown để khỏi tràn dòng
// trên header. Hiện ở mọi bề rộng — không có hàng nút desktop riêng.

import { useState } from "react";

export interface MenuItem {
  label: string;
  run: () => void;
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
        ☰
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="header-menu-panel" role="menu">
            <div className="user-email">{email ?? "Khách"}</div>
            {items.map((item) => (
              <button key={item.label} type="button" className="link" role="menuitem" onClick={() => pick(item.run)}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
