// Đọc *mục lục* của một tệp zip mà không phải nạp cả tệp vào bộ nhớ.
//
// Dự án đã có `jszip`, nhưng `loadAsync` đòi toàn bộ tệp dưới dạng một mảng
// byte — với gói Anki 217 MB thì đó là 217 MB RAM chỉ để lấy ra một tệp 2 MB.
// Zip may thay lại đọc được từ đuôi về đầu: mục lục trung tâm nằm cuối tệp và
// nói rõ từng entry bắt đầu ở byte nào. Biết offset rồi thì `File.slice` cắt
// đúng khúc cần, RAM chỉ giữ một entry tại một thời điểm (xem `data/apkgFile.ts`).
//
// Ở đây chỉ có phân tích byte thuần — không đụng `File`, không giải nén — nên
// test chạy được trên fixture dựng bằng `node:zlib`.

/** Một entry trong mục lục trung tâm. */
export interface ZipEntry {
  name: string;
  /** Byte bắt đầu của *local header* — không phải của dữ liệu; xem `dataOffset`. */
  headerOffset: number;
  compressedSize: number;
  uncompressedSize: number;
  /** 0 = chép thẳng (stored), 8 = deflate. Anki lưu media ở dạng 0. */
  method: number;
}

/** Chữ ký bốn byte mở đầu từng cấu trúc của định dạng zip. */
const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const EOCD_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;

/** Chú thích cuối tệp dài tối đa 65535 byte, nên EOCD luôn nằm trong chừng này
 *  byte cuối. Đọc dư một chút cho chắc rồi dò ngược. */
export const ZIP_TAIL_BYTES = 65535 + EOCD_SIZE;

/** Giá trị "tràn 32 bit" — dấu hiệu tệp dùng phần mở rộng ZIP64. */
const ZIP64_SENTINEL = 0xffffffff;

/** Vị trí và kích thước của mục lục trung tâm. */
export interface CentralDirectoryLocation {
  offset: number;
  size: number;
  entryCount: number;
}

/**
 * Dò EOCD trong `tail` — khúc byte cuối tệp. Dò từ cuối về đầu vì chú thích
 * cuối tệp có thể chứa một chuỗi byte trùng chữ ký; bản EOCD thật nằm sau cùng.
 *
 * Offset trả về tính từ ĐẦU TỆP, không phải từ đầu `tail`: chính EOCD ghi như
 * vậy, nên nơi gọi cắt thẳng được mà không phải cộng trừ gì thêm.
 */
export function findCentralDirectory(tail: Uint8Array): CentralDirectoryLocation {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  for (let i = tail.length - EOCD_SIZE; i >= 0; i -= 1) {
    if (view.getUint32(i, true) !== SIG_EOCD) continue;
    // Chữ ký EOCD chỉ là bốn byte, chú thích cuối tệp hoàn toàn có thể chứa
    // đúng bốn byte ấy. Bản THẬT thì trường "độ dài chú thích" của nó phải bằng
    // đúng số byte còn lại tới hết tệp — `tail` luôn kéo tới EOF nên so được.
    if (view.getUint16(i + 20, true) !== tail.length - (i + EOCD_SIZE)) continue;
    const size = view.getUint32(i + 12, true);
    const offset = view.getUint32(i + 16, true);
    // ZIP64 chỉ xuất hiện khi tệp vượt 4 GB hoặc quá 65535 entry. Gói Anki
    // không tới ngưỡng đó, nên thay vì cài cả phần mở rộng, ta báo thẳng.
    if (size === ZIP64_SENTINEL || offset === ZIP64_SENTINEL) {
      throw new Error("Tệp zip dùng định dạng ZIP64 — chưa hỗ trợ");
    }
    return { offset, size, entryCount: view.getUint16(i + 10, true) };
  }
  throw new Error("Không tìm thấy mục lục zip — tệp không phải .apkg hoặc đã hỏng");
}

/**
 * Phân tích khúc mục lục trung tâm thành danh sách entry.
 *
 * Entry nén bằng thuật toán lạ (không phải stored/deflate) vẫn được trả về kèm
 * `method` của nó: quyết định bỏ hay báo lỗi là việc của nơi gọi, ở đây chỉ đọc.
 */
export function parseCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = 0;
  while (at + CENTRAL_HEADER_SIZE <= bytes.length) {
    if (view.getUint32(at, true) !== SIG_CENTRAL) break;
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    entries.push({
      name: decoder.decode(bytes.subarray(at + CENTRAL_HEADER_SIZE, at + CENTRAL_HEADER_SIZE + nameLen)),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      uncompressedSize: view.getUint32(at + 24, true),
      headerOffset: view.getUint32(at + 42, true),
    });
    at += CENTRAL_HEADER_SIZE + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Dữ liệu của một entry bắt đầu ở byte nào, tính từ 30 byte đầu của local header.
 *
 * Phải đọc local header chứ không suy ra từ mục lục: hai chỗ có quyền ghi độ dài
 * trường `extra` KHÁC nhau (bên local hay có thêm timestamp), mà lệch một byte
 * là giải nén ra rác.
 */
export function dataOffset(localHeader: Uint8Array, headerOffset: number): number {
  const view = new DataView(localHeader.buffer, localHeader.byteOffset, localHeader.byteLength);
  if (view.getUint32(0, true) !== SIG_LOCAL) {
    throw new Error("Entry zip hỏng — sai chữ ký local header");
  }
  return headerOffset + LOCAL_HEADER_SIZE + view.getUint16(26, true) + view.getUint16(28, true);
}

export const ZIP_LOCAL_HEADER_SIZE = LOCAL_HEADER_SIZE;

/** Các cách nén ta giải được. */
export const ZIP_STORED = 0;
export const ZIP_DEFLATE = 8;
