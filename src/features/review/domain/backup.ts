// Sao lưu / phục hồi dữ liệu học (SRS) dạng JSON. Logic thuần, không I/O: đọc
// file, tải file, ghi IndexedDB nằm ở `../data/backup.ts`. Tách vậy để kiểm thử
// serialize/parse/hợp nhất mà không cần DOM hay IndexedDB.
//
// Vì sao có tính năng này: với người dùng khách, IndexedDB là bản duy nhất của
// dữ liệu học. Xuất backup cho họ một bản sao mang đi được; nhập lại trộn theo
// last-write-wins (dùng lại `mergeByUpdatedAt` ở tầng data) để không mất tiến độ.

import { VocabEntry } from "@/shared/types";

/** Nhãn nhận diện file backup — chặn nhập nhầm một JSON bất kỳ. */
export const BACKUP_FORMAT = "gioitu-learning-backup";

/** Phiên bản định dạng file (khác với DB_VERSION của IndexedDB). */
export const BACKUP_VERSION = 1;

/**
 * Ngưỡng nhắc khách sao lưu: đủ nhiều từ để "mất thì tiếc" nhưng chưa phiền quá
 * sớm. Cố ý là một hằng số có tên thay vì con số rải rác.
 */
export const GUEST_BACKUP_REMINDER_THRESHOLD = 20;

/** Nội dung một file backup dữ liệu học. */
export interface LearningBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** Epoch ms lúc xuất — để đặt tên file và cho người dùng biết bản này cũ/mới. */
  exported_at: number;
  /** Chủ nhân lúc xuất (thông tin; lúc nhập sẽ gán lại theo người đang dùng). */
  user_id: string;
  entries: VocabEntry[];
}

/** Gói danh sách entry thành một backup có nhãn + dấu thời gian. */
export function buildBackup(
  user_id: string,
  entries: VocabEntry[],
  now: number,
): LearningBackup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: now, user_id, entries };
}

/** Chuỗi JSON dễ đọc (indent 2) để người dùng có thể xem/lưu trữ. */
export function serializeBackup(backup: LearningBackup): string {
  return JSON.stringify(backup, null, 2);
}

function isEntryShape(x: unknown): x is VocabEntry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  // Bộ trường tối thiểu để hợp nhất (khoá + LWW) hoạt động đúng.
  return (
    typeof e.term === "string" &&
    typeof e.term_lang === "string" &&
    typeof e.native_lang === "string" &&
    typeof e.updated_at === "number"
  );
}

/**
 * Đọc chuỗi JSON thành backup, validate ở biên. Ném lỗi (tiếng Việt) khi JSON
 * hỏng, sai nhãn định dạng, hoặc có dòng entry méo — thà chặn còn hơn nuốt lặng
 * rồi ghi rác vào kho dữ liệu học.
 */
export function parseBackup(text: string): LearningBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Tệp không phải JSON hợp lệ");
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("Tệp sao lưu không đúng định dạng");
  }
  const obj = data as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) {
    throw new Error("Đây không phải tệp sao lưu dữ liệu học của Gioitu");
  }
  if (!Array.isArray(obj.entries) || !obj.entries.every(isEntryShape)) {
    throw new Error("Tệp sao lưu bị hỏng hoặc thiếu dữ liệu");
  }
  return {
    format: BACKUP_FORMAT,
    version: typeof obj.version === "number" ? obj.version : BACKUP_VERSION,
    exported_at: typeof obj.exported_at === "number" ? obj.exported_at : 0,
    user_id: typeof obj.user_id === "string" ? obj.user_id : "",
    entries: obj.entries as VocabEntry[],
  };
}

/**
 * Gán lại chủ nhân cho mọi entry theo người đang dùng. Nhờ vậy backup xuất từ
 * một tài khoản/phiên khách khác vẫn hiện ra sau khi nhập, thay vì nằm im dưới
 * `user_id` cũ mà app không đọc. Thuần — không đụng danh sách gốc.
 */
export function entriesForUser(backup: LearningBackup, user_id: string): VocabEntry[] {
  return backup.entries.map((e) => ({ ...e, user_id }));
}

/** Có nên nhắc khách sao lưu không: là khách, đủ nhiều từ, và chưa tắt lời nhắc. */
export function shouldRemindGuestBackup(input: {
  isGuest: boolean;
  wordCount: number;
  dismissed: boolean;
}): boolean {
  return input.isGuest && !input.dismissed && input.wordCount >= GUEST_BACKUP_REMINDER_THRESHOLD;
}
