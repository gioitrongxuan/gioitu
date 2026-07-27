// Tầng I/O cho sao lưu dữ liệu học: chọn/đọc/tải file (DOM) và đọc/ghi IndexedDB.
// Quyết định thuần (đóng gói, validate, hợp nhất) nằm ở `../domain/backup.ts`.

import { getDb } from "@/shared/db";
import { VocabEntry } from "@/shared/types";
import { datedFilename, downloadBlob } from "@/shared/downloadBlob";
import {
  LearningBackup,
  buildBackup,
  serializeBackup,
  parseBackup,
  entriesForUser,
  logRowsForUser,
  missingLogRows,
} from "../domain/backup";
import { getAllEntries, mergeByUpdatedAt } from "./repository";
import { getReviewLog } from "./reviewLog";

/**
 * Xuất toàn bộ dữ liệu học của người dùng hiện tại ra file JSON tải về.
 * `includeHistory` (Premium) đính kèm cả lịch sử ôn (`review_log`) — bản sao
 * lưu khi đó là ảnh đầy đủ, nhập lại không mất quá khứ ôn tập. Trả về số entry
 * + số dòng lịch sử đã xuất để caller phản hồi cho người dùng.
 */
export async function exportBackup(
  user_id: string,
  includeHistory = false,
): Promise<{ entryCount: number; logCount: number }> {
  const entries = await getAllEntries(user_id);
  const log = includeHistory ? await getReviewLog(user_id) : undefined;
  const backup = buildBackup(user_id, entries, Date.now(), log);
  const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
  downloadBlob(blob, datedFilename("gioitu-backup", "json", new Date(backup.exported_at)));
  return { entryCount: entries.length, logCount: log?.length ?? 0 };
}

/** Mở hộp thoại chọn file JSON; trả về file đã chọn, hoặc null nếu người dùng huỷ. */
export function pickBackupFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // Bấm Huỷ ở hộp thoại chọn file không phát sự kiện đáng tin trên mọi trình
    // duyệt; ta chỉ chờ `change`, còn huỷ thì Promise treo vô hại (không side-effect).
    input.click();
  });
}

/** Đọc + validate một file backup thành cấu trúc đã kiểm. Ném lỗi khi tệp hỏng. */
export async function readBackupFile(file: File): Promise<LearningBackup> {
  return parseBackup(await file.text());
}

/**
 * Nhập backup vào kho dữ liệu học của người dùng hiện tại: gán lại chủ nhân, trộn
 * last-write-wins với dữ liệu đang có (dùng lại `mergeByUpdatedAt`) rồi ghi cả
 * tập đã trộn xuống IndexedDB. File v2 có `review_log` thì chỉ ghi bổ sung các
 * dòng CHƯA có (append-only, không nhân đôi lịch sử khi nhập lại cùng file);
 * nhập lịch sử không cần Premium — gate nằm ở lúc xuất, dữ liệu đã xuất thì
 * luôn phục hồi được. Trả về số entry + số dòng lịch sử đã nhập.
 */
export async function importBackup(
  user_id: string,
  backup: LearningBackup,
): Promise<{ entryCount: number; logCount: number }> {
  const incoming = entriesForUser(backup, user_id);
  const existing = await getAllEntries(user_id);
  const merged: VocabEntry[] = mergeByUpdatedAt(existing, incoming);

  const db = await getDb();
  const tx = db.transaction("user_data", "readwrite");
  for (const e of merged) await tx.store.put(e);
  await tx.done;

  let logCount = 0;
  if (backup.review_log != null && backup.review_log.length > 0) {
    const incomingLog = logRowsForUser(backup.review_log, user_id);
    const newRows = missingLogRows(await getReviewLog(user_id), incomingLog);
    const logTx = db.transaction("review_log", "readwrite");
    for (const row of newRows) await logTx.store.add(row);
    await logTx.done;
    logCount = newRows.length;
  }

  return { entryCount: incoming.length, logCount };
}
