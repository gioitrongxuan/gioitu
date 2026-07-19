// Xuất một từ điển local thành file `.zip` Yomitan (#70 — 5.1). Client-side,
// zero-cost server: đọc từ điển + các từ của nó từ IndexedDB rồi đóng gói bằng
// JSZip (đã có sẵn trong dự án). Logic dựng nội dung file là hàm thuần ở
// domain/yomitanExport; ở đây chỉ có phần chạm IndexedDB, JSZip và DOM.

import { getDb } from "@/shared/db";
import { buildYomitanFiles } from "../domain/yomitanExport";

export interface DictZip {
  blob: Blob;
  filename: string;
}

/** Slug an toàn cho tên file từ tiêu đề từ điển (giữ chữ có dấu, bỏ ký tự lạ). */
function toFilename(title: string): string {
  const slug = title
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .slice(0, 60);
  return `${slug || "tu-dien"}.zip`;
}

// Revision mang tính mô tả (Yomitan chỉ hiển thị); ngày xuất là đủ và ổn định
// trong một lần xuất, giúp phân biệt các bản export theo thời điểm.
function exportRevision(): string {
  return `gioitu-${new Date().toISOString().slice(0, 10)}`;
}

/**
 * Đọc một từ điển local cùng toàn bộ từ của nó (qua chỉ mục `by_dict`) và đóng
 * gói thành một archive Yomitan `.zip`. Ném lỗi nếu không tìm thấy từ điển.
 */
export async function exportDictAsZip(dictId: string, revision?: string): Promise<DictZip> {
  const db = await getDb();
  const dict = await db.get("dictionaries", dictId);
  if (!dict) throw new Error("Không tìm thấy từ điển để xuất");
  const entries = await db.getAllFromIndex("terms", "by_dict", dictId);

  const { index, termBank } = buildYomitanFiles(dict, entries, revision ?? exportRevision());

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("index.json", JSON.stringify(index));
  zip.file("term_bank_1.json", JSON.stringify(termBank));
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });

  return { blob, filename: toFilename(dict.title) };
}

/** Kích hoạt trình duyệt tải một Blob về máy (chỉ chạy phía client — dùng DOM). */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
