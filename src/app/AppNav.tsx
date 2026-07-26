// Điều hướng 4 khu (#149, DESIGN.md §4): cùng một DOM, hai bố cục do CSS quyết
// theo MOBILE_MEDIA_QUERY — bottom tab bar trên mobile, sidebar dính trái trên
// desktop. Khu "Hôm nay" đeo badge số từ đến hạn (nợ hôm nay thấy được từ mọi
// màn, không cần mở menu).

import { ReactNode } from "react";
import { LayersIcon, SearchIcon, SunIcon, UserIcon } from "@/shared/ui/icons";
import { Khu } from "./routes";
import "./shell.css";

const TABS: { khu: Khu; label: string; icon: ReactNode }[] = [
  { khu: "today", label: "Hôm nay", icon: <SunIcon /> },
  { khu: "search", label: "Tra cứu", icon: <SearchIcon /> },
  { khu: "words", label: "Kho từ", icon: <LayersIcon /> },
  { khu: "me", label: "Tôi", icon: <UserIcon /> },
];

interface AppNavProps {
  active: Khu;
  /** Số từ đến hạn — badge trên khu "Hôm nay" (ẩn khi 0). */
  dueCount: number;
  onSelect: (khu: Khu) => void;
  /** inert + aria-hidden khi bottom sheet mobile phủ lên (App tính, spread vào nav). */
  behindSheet?: Record<string, unknown>;
}

export function AppNav({ active, dueCount, onSelect, behindSheet }: AppNavProps) {
  return (
    <nav className="app-nav" aria-label="Điều hướng chính" {...behindSheet}>
      {TABS.map((tab) => (
        <button
          key={tab.khu}
          type="button"
          className={`app-nav-item${tab.khu === active ? " active" : ""}`}
          aria-current={tab.khu === active ? "page" : undefined}
          onClick={() => onSelect(tab.khu)}
        >
          <span className="app-nav-icon">
            {tab.icon}
            {tab.khu === "today" && dueCount > 0 && (
              <span className="app-nav-badge" aria-label={`${dueCount} từ đến hạn`}>
                {dueCount > 99 ? "99+" : dueCount}
              </span>
            )}
          </span>
          <span className="app-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
