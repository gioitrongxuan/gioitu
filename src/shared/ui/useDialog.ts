// Hành vi chung cho mọi overlay dạng dialog (DESIGN §3.3): Escape đóng, focus
// chuyển vào phần tử tương tác đầu tiên khi mở và TRẢ LẠI phần tử đã focus
// trước đó khi đóng, Tab/Shift+Tab bẫy vòng trong overlay (focus trap) thay vì
// thoát ra nền phía sau. Gắn ref trả về vào phần tử gốc của dialog
// (div role="dialog") — không phải lớp backdrop bao ngoài.
//
// stopPropagation trên CẢ Escape lẫn Tab: khi một dialog lồng trong dialog
// khác (vd CustomDictionary mở dialog xử-lý-trùng bên trong), sự kiện bàn
// phím bubble lên listener của dialog ngoài nếu không chặn — làm bẫy focus
// của dialog trong bị dialog ngoài giành lại, và Escape đóng nhầm cả hai lớp.

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog<T extends HTMLElement>(onClose: () => void): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    (focusables()[0] ?? dialog).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      e.stopPropagation();
      const nodes = focusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      // Modal đã đóng hẳn (unmount) hoặc chuẩn bị đóng — trả focus về nơi đã
      // mở nó (thường là nút bấm mở dialog), không để focus rơi về <body>.
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return ref;
}
