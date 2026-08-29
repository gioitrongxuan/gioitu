// Dựng tệp zip trong bộ nhớ cho các test đọc gói Anki.
//
// Không mượn thư viện nén: cả điểm của `domain/zip.ts` là tự đọc định dạng, nên
// fixture cũng phải dựng bằng tay thì test mới thật sự đi qua đúng những byte mà
// bộ đọc sẽ gặp ngoài đời.

import { deflateRawSync } from "node:zlib";
import { ZIP_DEFLATE, ZIP_LOCAL_HEADER_SIZE, ZIP_STORED } from "@/features/vocabstudy/domain/zip";

/** Một entry để nhét vào zip giả. `extraLocal` mô phỏng đúng cái bẫy thật: mục
 *  lục trung tâm và local header khai độ dài trường `extra` khác nhau. */
export interface FakeEntry {
  name: string;
  data: Buffer;
  deflate?: boolean;
  extraLocal?: number;
}

/**
 * Dựng một tệp zip tối giản trong bộ nhớ. Đủ thật để bộ đọc phải đi đúng đường:
 * có cả entry stored lẫn deflate, có trường `extra` lệch giữa hai header, và có
 * chú thích cuối tệp để phép dò EOCD không được phép ăn may.
 */
export function buildZip(entries: FakeEntry[], comment = Buffer.alloc(0)): Uint8Array<ArrayBuffer> {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const stored = e.deflate ? deflateRawSync(e.data) : e.data;
    const method = e.deflate ? ZIP_DEFLATE : ZIP_STORED;
    const name = Buffer.from(e.name, "utf8");
    const extra = Buffer.alloc(e.extraLocal ?? 0);

    const local = Buffer.alloc(ZIP_LOCAL_HEADER_SIZE);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, extra, stored);
    centrals.push(central, name);
    offset += local.length + name.length + extra.length + stored.length;
  }

  const body = Buffer.concat(locals);
  const dir = Buffer.concat(centrals);
  const note = comment;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(dir.length, 12);
  eocd.writeUInt32LE(body.length, 16);
  eocd.writeUInt16LE(note.length, 20);
  // Trả `Uint8Array` neo vào `ArrayBuffer` chứ không phải `Buffer`: nơi gọi dựng
  // `Blob` từ mảng này, mà `Buffer` khai kiểu đệm rộng hơn `BlobPart` chấp nhận.
  return new Uint8Array(Buffer.concat([body, dir, eocd, note]));
}
