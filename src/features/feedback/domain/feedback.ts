// Logic thuần cho góp ý về web (#244): loại góp ý và kiểm tra bản nháp trước khi
// gửi. Tách khỏi UI để test được, và để form không tự bịa luật riêng — server
// (`server/src/features/feedback/feedbackStore.ts`) kiểm lại đúng các luật này.

export type FeedbackKind = "bug" | "idea" | "other";

/** Loại góp ý theo thứ tự hiện trong form; nhãn là chữ người dùng đọc. */
export const FEEDBACK_KINDS: { kind: FeedbackKind; label: string }[] = [
  { kind: "bug", label: "Báo lỗi" },
  { kind: "idea", label: "Ý tưởng / tính năng mới" },
  { kind: "other", label: "Khác" },
];

/** Trần độ dài nội dung — khớp MAX_MESSAGE của server. */
export const FEEDBACK_MAX = 2000;

/**
 * Nhãn của một loại góp ý. Loại lạ (server thêm loại mới, client chưa biết) trả
 * về nguyên mã thay vì gộp vào "Khác" — màn admin cần đọc đúng thứ đã lưu.
 */
export function kindLabel(kind: string): string {
  return FEEDBACK_KINDS.find((k) => k.kind === kind)?.label ?? kind;
}

export interface FeedbackDraft {
  kind: string;
  message: string;
}

export type FeedbackCheck =
  | { ok: true; value: { kind: FeedbackKind; message: string } }
  | { ok: false; error: string };

/**
 * Bản nháp đã gửi được chưa. Trả về nội dung đã trim để chỗ gọi gửi đúng thứ
 * server sẽ lưu (không lệch một dấu cách so với con số đếm ký tự trên form).
 */
export function checkFeedback(draft: FeedbackDraft): FeedbackCheck {
  const message = draft.message.trim();
  if (!message) return { ok: false, error: "Hãy nhập nội dung góp ý" };
  if (message.length > FEEDBACK_MAX) {
    return { ok: false, error: `Góp ý quá dài (tối đa ${FEEDBACK_MAX} ký tự)` };
  }
  const kind = FEEDBACK_KINDS.find((k) => k.kind === draft.kind)?.kind;
  if (!kind) return { ok: false, error: "Loại góp ý không hợp lệ" };
  return { ok: true, value: { kind, message } };
}
