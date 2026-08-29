// Ảnh và phát âm nhập kèm từ gói Anki, lưu trong IndexedDB theo từng bộ từ.
//
// Vì sao lưu blob chứ không giữ nguyên tệp `.apkg`: gói nằm ngoài quyền của
// trang web, người dùng đổi tên hay xoá là thẻ mất ảnh; mà giữ file handle thì
// khách chưa đăng nhập cũng không có chỗ nào bền để cất. Chép ra IndexedDB một
// lần rồi thôi, giống hệt cách từ điển Yomitan đã làm.
//
// Lớp I/O thuần: quyết định lấy tệp nào là việc của `domain/ankiDeck.ts`
// (`mediaNamesOf`), bóc byte là việc của `apkgFile.ts`.

import { getDb, WordsetMedia } from "@/shared/db";
import { sniffMediaType } from "../domain/mediaType";
import { ApkgArchive } from "./apkgFile";

/** Số tệp ghi trong MỘT transaction — cùng lý do với `WRITE_CHUNK` của
 *  `wordsets.ts`: transaction sống quá lâu thì tab lag thấy rõ. */
const WRITE_CHUNK = 50;

/** Kết quả một lượt nhập media — nói thật những gì KHÔNG lấy được. */
export interface MediaImportResult {
  stored: number;
  /** Tệp mà thẻ trỏ tới nhưng gói không có (deck chia sẻ hay thiếu vặt). */
  missing: number;
  /** Dừng giữa chừng vì máy hết chỗ trống. */
  outOfSpace: boolean;
}

/**
 * Bóc các tệp media theo tên rồi ghi vào IndexedDB cho một bộ từ.
 *
 * Chạy tuần tự chứ không song song: bóc một tệp là đọc một khúc đĩa, chạy hàng
 * loạt cùng lúc chỉ tổ tranh nhau I/O mà bộ nhớ thì phình lên bằng tổng các tệp
 * đang giữ. Tuần tự cũng là điều kiện để thanh tiến độ nói đúng sự thật.
 *
 * KHÔNG ném lỗi khi thiếu tệp hay hết chỗ: phần chữ của bộ từ đã ghi xong và
 * vẫn dùng được, nên việc đúng là ghi được đến đâu hay đến đó rồi *báo cáo* chỗ
 * thiếu, để màn nhập nói thẳng "thiếu N tệp" thay vì lặng lẽ hiện thẻ không ảnh.
 */
export async function importWordsetMedia(
  setId: string,
  archive: ApkgArchive,
  /** Tên tệp thật → tên entry trong gói (xem `readMediaMap`). */
  entryOf: Map<string, string>,
  names: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<MediaImportResult> {
  const db = await getDb();
  let stored = 0;
  let missing = 0;

  for (let i = 0; i < names.length; i += WRITE_CHUNK) {
    const batch = names.slice(i, i + WRITE_CHUNK);
    const rows: WordsetMedia[] = [];
    for (const name of batch) {
      const entry = entryOf.get(name);
      if (!entry || !archive.has(entry)) {
        missing += 1;
        continue;
      }
      const bytes = await archive.read(entry);
      rows.push({ setId, name, blob: new Blob([bytes], { type: sniffMediaType(name, bytes) }) });
    }

    try {
      const tx = db.transaction("wordset_media", "readwrite");
      for (const row of rows) await tx.store.put(row);
      await tx.done;
      stored += rows.length;
    } catch (e) {
      // Hết quota là lỗi DUY NHẤT đáng dừng cả vòng: thử tiếp cũng chỉ hỏng
      // tiếp. Lỗi khác thì ném lên như thường, đừng nuốt.
      if (!isQuotaError(e)) throw e;
      console.warn("wordset media: hết chỗ trống", e);
      onProgress?.(Math.min(i + batch.length, names.length), names.length);
      return { stored, missing, outOfSpace: true };
    }
    onProgress?.(Math.min(i + batch.length, names.length), names.length);
  }

  return { stored, missing, outOfSpace: false };
}

/** Trình duyệt báo hết chỗ bằng `QuotaExceededError`; Safari từng dùng tên khác. */
function isQuotaError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED";
}

/** Một tệp media của bộ. `undefined` khi bộ ấy không nhập media (hoặc thiếu tệp). */
export async function getWordsetMedia(setId: string, name: string): Promise<Blob | undefined> {
  const db = await getDb();
  return (await db.get("wordset_media", [setId, name]))?.blob;
}

/**
 * Xoá sạch media của một bộ.
 *
 * Khoá ghép mở đầu bằng `setId` nên một khoảng khoá quét trọn bộ — cùng mẹo với
 * `wordset_words`, không phải nuôi thêm index chỉ để xoá. Thiếu bước này thì xoá
 * một bộ N1 xong vẫn còn 170 MB nằm lại vĩnh viễn mà không giao diện nào thấy.
 */
export async function deleteWordsetMedia(setId: string): Promise<void> {
  const db = await getDb();
  await db.delete("wordset_media", IDBKeyRange.bound([setId], [setId, []]));
}

/** Tổng dung lượng media của một bộ, để màn quản lý nói được bộ nào chiếm bao nhiêu. */
export async function wordsetMediaSize(setId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.getAll("wordset_media", IDBKeyRange.bound([setId], [setId, []]));
  return rows.reduce((sum, row) => sum + row.blob.size, 0);
}
