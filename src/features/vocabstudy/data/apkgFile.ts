// Mở một tệp `.apkg` và lấy ra từng phần, KHÔNG nạp cả tệp vào bộ nhớ.
//
// Gói Anki tải về hay nặng vài trăm MB vì kèm ảnh và phát âm, trong khi phần
// cần cho bộ từ chỉ là tệp cơ sở dữ liệu vài MB. Nên ở đây không đọc `file` thành
// mảng byte: `Blob.slice` chỉ tạo một "cửa sổ" trỏ vào tệp trên đĩa, đọc tới đâu
// tốn RAM tới đó. Biết cắt ở byte nào là nhờ mục lục zip (`domain/zip.ts`).
//
// Giải nén dùng `DecompressionStream` có sẵn trong trình duyệt — không thêm thư
// viện. Riêng media trong gói Anki vốn được ghi ở dạng chép thẳng nên còn không
// phải giải nén, chỉ cắt byte.

import {
  dataOffset,
  findCentralDirectory,
  parseCentralDirectory,
  ZIP_DEFLATE,
  ZIP_LOCAL_HEADER_SIZE,
  ZIP_STORED,
  ZIP_TAIL_BYTES,
  ZipEntry,
} from "../domain/zip";

/** Tên tệp cơ sở dữ liệu bên trong gói, xếp theo thứ tự ưu tiên đọc.
 *
 *  Gói xuất từ Anki 2.1.28–2.1.50 chứa cả `collection.anki21` (bản mới, đầy đủ)
 *  lẫn `collection.anki2` (bản rút gọn để Anki đời cũ vẫn mở được). Cùng có mặt
 *  thì bản mới mới là bản thật. */
const DATABASE_NAMES = ["collection.anki21", "collection.anki2"];

/** Tên tệp cơ sở dữ liệu của định dạng mới — nén zstd, chưa giải được. */
const ZSTD_DATABASE_NAME = "collection.anki21b";

/** Bản đồ "số thứ tự trong zip → tên tệp thật" của media, dạng JSON. */
export const MEDIA_MAP_NAME = "media";

export class ApkgArchive {
  private readonly blob: Blob;
  private readonly entries: Map<string, ZipEntry>;

  private constructor(blob: Blob, entries: Map<string, ZipEntry>) {
    this.blob = blob;
    this.entries = entries;
  }

  /** Đọc mục lục ở cuối tệp. Chỉ chạm đúng hai khúc nhỏ, không đụng phần thân. */
  static async open(blob: Blob): Promise<ApkgArchive> {
    const tailAt = Math.max(0, blob.size - ZIP_TAIL_BYTES);
    const tail = new Uint8Array(await blob.slice(tailAt).arrayBuffer());
    const dir = findCentralDirectory(tail);
    const bytes = new Uint8Array(await blob.slice(dir.offset, dir.offset + dir.size).arrayBuffer());

    const entries = new Map<string, ZipEntry>();
    for (const entry of parseCentralDirectory(bytes)) entries.set(entry.name, entry);
    if (entries.size === 0) throw new Error("Mục lục gói Anki rỗng — tệp hỏng");
    return new ApkgArchive(blob, entries);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** Danh sách tên mọi tệp trong gói. */
  names(): string[] {
    return [...this.entries.keys()];
  }

  /** Kích thước sau giải nén của một tệp, để ước lượng trước khi bóc. */
  sizeOf(name: string): number {
    return this.entries.get(name)?.uncompressedSize ?? 0;
  }

  /** Bóc một tệp trong gói ra thành byte.
   *
   *  Kiểu neo vào `ArrayBuffer` chứ không để `ArrayBufferLike`: nơi gọi còn dựng
   *  `Blob` từ mảng này, mà `ArrayBufferLike` bao gồm cả `SharedArrayBuffer` —
   *  thứ không làm `BlobPart` được. */
  async read(name: string): Promise<Uint8Array<ArrayBuffer>> {
    const entry = this.entries.get(name);
    if (!entry) throw new Error(`Gói Anki không có tệp “${name}”`);

    // Độ dài trường `extra` ở local header có quyền khác với ở mục lục, nên phải
    // đọc header thật mới biết dữ liệu bắt đầu từ đâu.
    const headerEnd = entry.headerOffset + ZIP_LOCAL_HEADER_SIZE;
    const header = new Uint8Array(await this.blob.slice(entry.headerOffset, headerEnd).arrayBuffer());
    const start = dataOffset(header, entry.headerOffset);
    const chunk = this.blob.slice(start, start + entry.compressedSize);

    if (entry.method === ZIP_STORED) return new Uint8Array(await chunk.arrayBuffer());
    if (entry.method === ZIP_DEFLATE) return inflateRaw(chunk, entry.uncompressedSize);
    throw new Error(`Tệp “${name}” nén bằng cách chưa hỗ trợ (mã ${entry.method})`);
  }

  /** Bóc một tệp rồi đọc thành chữ UTF-8. */
  async readText(name: string): Promise<string> {
    return new TextDecoder().decode(await this.read(name));
  }
}

/**
 * Lấy tệp cơ sở dữ liệu của gói.
 *
 * Gói xuất từ Anki đời mới chỉ có bản nén zstd, mà trình duyệt không giải nén
 * zstd được (`DecompressionStream` chỉ biết gzip và deflate). Trường hợp ấy phải
 * nói rõ người dùng cần làm gì — chứ báo "tệp hỏng" thì họ đi sửa nhầm chỗ.
 */
export async function readAnkiDatabase(archive: ApkgArchive): Promise<Uint8Array<ArrayBuffer>> {
  const name = DATABASE_NAMES.find((n) => archive.has(n));
  if (name) return archive.read(name);
  if (archive.has(ZSTD_DATABASE_NAME)) {
    throw new Error(
      "Gói này ở định dạng Anki mới, chưa đọc được. Trong Anki chọn Xuất rồi bật " +
        "“Hỗ trợ Anki 2.1.50 trở xuống”, sau đó nhập lại tệp vừa xuất.",
    );
  }
  throw new Error("Trong gói không có cơ sở dữ liệu Anki — tệp này có phải .apkg không?");
}

/**
 * Bản đồ "tên tệp thật → tên entry trong zip".
 *
 * Trong gói, media không mang tên của nó: các tệp được đặt tên `0`, `1`, `2`…
 * còn tệp `media` là một JSON nói entry nào ứng với tên nào. Thẻ Anki thì trỏ
 * tới tên thật (`[sound:N1_0001_1.mp3]`), nên ta cần chiều ngược lại của JSON ấy.
 *
 * Gói không có tệp `media` (deck thuần chữ) thì trả về bản đồ rỗng — đó là
 * trạng thái hợp lệ, không phải lỗi.
 */
export async function readMediaMap(archive: ApkgArchive): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!archive.has(MEDIA_MAP_NAME)) return map;

  const raw = await archive.readText(MEDIA_MAP_NAME);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Định dạng Anki mới ghi bản đồ này bằng protobuf nén zstd, không phải JSON.
    // Tới được đây nghĩa là gói trộn hai đời định dạng — bỏ media, phần chữ vẫn
    // nhập được, và người dùng được báo là thiếu media chứ không phải hỏng hết.
    return map;
  }
  if (!parsed || typeof parsed !== "object") return map;

  for (const [entryName, realName] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof realName === "string" && realName !== "") map.set(realName, entryName);
  }
  return map;
}

/**
 * Giải nén một khối deflate thô.
 *
 * `DecompressionStream` nhận `Blob.stream()` nên dữ liệu chảy thẳng từ đĩa qua
 * bộ giải nén, không phải nạp bản nén vào RAM trước.
 */
async function inflateRaw(chunk: Blob, expectedSize: number): Promise<Uint8Array<ArrayBuffer>> {
  const stream = chunk.stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const parts: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.length;
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  // Lệch kích thước nghĩa là dữ liệu đứt hoặc offset sai — im lặng cho qua thì
  // lỗi sẽ hiện ra ở tít bên bộ đọc SQLite dưới dạng khó hiểu hơn nhiều.
  if (expectedSize > 0 && total !== expectedSize) {
    throw new Error(`Giải nén ra ${total} byte, lẽ ra ${expectedSize} — gói Anki hỏng`);
  }
  return out;
}
