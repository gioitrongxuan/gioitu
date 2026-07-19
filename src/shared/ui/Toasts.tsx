// Transient toast notifications (SPEC 4.2 relapse warning, etc.).
// The `Toast` shape lives here (shared) so producers like the review store can
// depend on the shared UI kernel rather than the other way around.

import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "warn" | "success";
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

export function pushToast(message: string, kind: Toast["kind"] = "info") {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, message, kind }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, 4000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return toasts;
}

/** Subtree riêng cho toast — subscribe trực tiếp vào kho, không qua props của MainApp. */
export function ToastHost() {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  return (
    <div className="toasts" aria-live="polite">
      {current.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
