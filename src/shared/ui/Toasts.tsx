// Transient toast notifications (SPEC 4.2 relapse warning, etc.).
// The `Toast` shape lives here (shared) so producers like the review store can
// depend on the shared UI kernel rather than the other way around.

import { useSyncExternalStore } from "react";

export interface ToastAction {
  /** Nhãn nút (vd "Hoàn tác"). */
  label: string;
  /** Chạy khi bấm nút; toast tự đóng ngay sau đó. */
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "warn" | "success";
  /** Nút hành động tuỳ chọn (vd hoàn tác); vắng thì toast chỉ là thông báo. */
  action?: ToastAction;
}

// Kho toast sống ngoài cây React (module-level), không phải state của MainApp:
// một toast tự tắt sau 4s trước đây nằm chung state với `entries` trong
// useAppStore, nên mỗi lần tắt/bật toast lại re-render toàn bộ MainApp — kể cả
// Word Cloud cả nghìn nút bấm. Producer (store) chỉ gọi `pushToast`; UI subscribe
// qua `ToastHost`, tách hẳn thành một subtree riêng không kéo theo cha re-render.
let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function pushToast(message: string, kind: Toast["kind"] = "info", action?: ToastAction) {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, message, kind, action }];
  notify();
  setTimeout(() => {
    dismissToast(id);
  }, 4000);
}

/** Gỡ một toast theo id (tự tắt hết giờ, hoặc bấm nút hành động xong). */
export function dismissToast(id: number) {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return toasts;
}

/** Ảnh chụp hàng toast hiện tại (cho test và người đọc ngoài React). */
export function getToasts(): readonly Toast[] {
  return toasts;
}

/** Subtree riêng cho toast — subscribe trực tiếp vào kho, không qua props của MainApp. */
export function ToastHost() {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  return (
    <div className="toasts" aria-live="polite">
      {current.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action?.onClick();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
