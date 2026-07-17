// Lời nhắc nhẹ cho khách đã tích luỹ nhiều từ: dữ liệu học chỉ nằm trên máy này,
// mời đăng nhập để đồng bộ hoặc xuất một bản sao lưu. Tắt được (nhớ qua
// localStorage) để không phiền. Quyết định "có hiện không" là logic thuần ở
// domain/backup.ts — component chỉ lo trạng thái tắt và render.

import { useState } from "react";
import { shouldRemindGuestBackup } from "../domain/backup";

const DISMISSED_KEY = "gioitu.guestBackupDismissed.v1";

function loadDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false; // storage cấm (ẩn danh) — cứ hiện lời nhắc
  }
}

function saveDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

interface GuestBackupBannerProps {
  isGuest: boolean;
  wordCount: number;
  onLogin: () => void;
  onExport: () => void;
}

export function GuestBackupBanner({ isGuest, wordCount, onLogin, onExport }: GuestBackupBannerProps) {
  const [dismissed, setDismissed] = useState(loadDismissed);

  if (!shouldRemindGuestBackup({ isGuest, wordCount, dismissed })) return null;

  const dismiss = () => {
    saveDismissed();
    setDismissed(true);
  };

  return (
    <div className="guest-backup-banner" role="status">
      <p className="gbb-text">
        Dữ liệu học đang chỉ lưu trên máy này. Đăng nhập để đồng bộ nhiều thiết bị,
        hoặc xuất một bản sao lưu để giữ an toàn.
      </p>
      <div className="gbb-actions">
        <button type="button" className="link" onClick={onLogin}>Đăng nhập</button>
        <button type="button" className="link" onClick={onExport}>Xuất bản sao lưu</button>
        <button type="button" className="link" onClick={dismiss}>Ẩn</button>
      </div>
    </div>
  );
}
