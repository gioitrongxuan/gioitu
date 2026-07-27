// Nút "Sao chép" dùng chung: ghi clipboard + cờ `copied` bật tạm để nhãn đổi
// thành "Đã chép" rồi tự trở về — phản hồi tức thời mà không cần toast.

import { useState } from "react";

/** Cờ `copied` tự tắt sau khoảng này — đủ thấy phản hồi, không kẹt nhãn. */
const COPIED_RESET_MS = 1500;

export function useCopyToClipboard(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      // Clipboard có thể bị chặn (origin không bảo mật) — người dùng vẫn chọn tay được.
    }
  }

  return { copied, copy };
}
