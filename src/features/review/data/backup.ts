// Tầng I/O cho sao lưu dữ liệu học: chọn/đọc/tải file (DOM) và đọc/ghi IndexedDB.
// Quyết định thuần (đóng gói, validate, hợp nhất) nằm ở `../domain/backup.ts`.

import { getDb } from "@/shared/db";
import { VocabEntry } from "@/shared/types";
import {
  LearningBackup,
  buildBackup,
  serializeBackup,
  parseBackup,
  entriesForUser,
} from "../domain/backup";
import { getAllEntries, mergeByUpdatedAt } from "./repository";

/** Tên file theo ngày để nhiều bản sao lưu không đè nhau. */
function backupFilename(exportedAt: number): string {
  const day = new Date(exportedAt).toISOString().slice(0, 10); // YYYY-MM-DD
  return `gioitu-backup-${day}.json`;
}

/** Đẩy một chuỗi xuống trình duyệt dưới dạng file tải về. */
function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Xuất toàn bộ dữ liệu học của người dùng hiện tại ra file JSON tải về. Trả về
 * số entry đã xuất để caller phản hồi cho người dùng.
 */
export async function exportBackup(user_id: string): Promise<number> {
  const entries = await getAllEntries(user_id);
  const backup = buildBackup(user_id, entries, Date.now());
  triggerDownload(serializeBackup(backup), backupFilename(backup.exported_at));
  return entries.length;
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
 * tập đã trộn xuống IndexedDB. Trả về số entry trong file (số bản ghi được nhập).
 */
export async function importBackup(user_id: string, backup: LearningBackup): Promise<number> {
  const incoming = entriesForUser(backup, user_id);
  const existing = await getAllEntries(user_id);
  const merged: VocabEntry[] = mergeByUpdatedAt(existing, incoming);

  const db = await getDb();
  const tx = db.transaction("user_data", "readwrite");
  for (const e of merged) await tx.store.put(e);
  await tx.done;

  return incoming.length;
}
