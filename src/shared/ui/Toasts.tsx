// Transient toast notifications (SPEC 4.2 relapse warning, etc.).
// The `Toast` shape lives here (shared) so producers like the review store can
// depend on the shared UI kernel rather than the other way around.

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "warn" | "success";
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
