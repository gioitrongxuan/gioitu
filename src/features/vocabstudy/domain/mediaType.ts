// Đoán kiểu MIME của một tệp media trong gói Anki.
//
// Anki không ghi kiểu MIME ở đâu cả, mà thiếu nó thì `<audio>` nhận một blob vô
// danh rồi từ chối phát. Đuôi tệp là manh mối đầu tiên — nhưng KHÔNG đủ: trong
// bộ JLPT Tango N1, tệp `1670892071719.jpg` thật ra mở đầu bằng `47 49 46`, tức
// là một tệp GIF mang tên .jpg. Thẻ Anki gom ảnh từ khắp nơi trên mạng nên
// chuyện tên một đằng ruột một nẻo là bình thường.
//
// Nên: ngửi mấy byte đầu trước, đuôi tệp chỉ là phương án dự phòng.

/** Chữ ký byte mở đầu của các định dạng gặp trong gói Anki. */
const SIGNATURES: { mime: string; magic: number[]; at?: number }[] = [
  { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/gif", magic: [0x47, 0x49, 0x46, 0x38] }, // "GIF8"
  { mime: "audio/ogg", magic: [0x4f, 0x67, 0x67, 0x53] }, // "OggS"
  { mime: "audio/mpeg", magic: [0x49, 0x44, 0x33] }, // thẻ ID3 mở đầu tệp mp3
  { mime: "audio/mp4", magic: [0x66, 0x74, 0x79, 0x70], at: 4 }, // "ftyp" của m4a
];

/** RIFF bọc cả WAV lẫn WEBP; phải đọc thêm bốn byte ở vị trí 8 mới phân biệt được. */
const RIFF = [0x52, 0x49, 0x46, 0x46];
const RIFF_KINDS: { mime: string; magic: number[] }[] = [
  { mime: "audio/wav", magic: [0x57, 0x41, 0x56, 0x45] }, // "WAVE"
  { mime: "image/webp", magic: [0x57, 0x45, 0x42, 0x50] }, // "WEBP"
];

/** Đuôi tệp → kiểu MIME, dùng khi ngửi byte không ra gì. */
const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  opus: "audio/opus",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/** Kiểu dùng khi chịu thua — trình duyệt sẽ tự đoán lấy. */
const UNKNOWN_MIME = "application/octet-stream";

/** Số byte đầu cần để nhận dạng. Đủ cho chữ ký dài nhất (RIFF ở vị trí 8). */
export const MEDIA_SNIFF_BYTES = 12;

function startsWith(bytes: Uint8Array, magic: number[], at = 0): boolean {
  if (bytes.length < at + magic.length) return false;
  return magic.every((b, i) => bytes[at + i] === b);
}

/**
 * Kiểu MIME của một tệp, ưu tiên chữ ký byte hơn đuôi tệp.
 *
 * `head` chỉ cần `MEDIA_SNIFF_BYTES` byte đầu — truyền cả tệp cũng được, hàm chỉ
 * đọc phần đầu.
 */
export function sniffMediaType(name: string, head: Uint8Array): string {
  for (const { mime, magic, at } of SIGNATURES) {
    if (startsWith(head, magic, at)) return mime;
  }
  if (startsWith(head, RIFF)) {
    for (const { mime, magic } of RIFF_KINDS) {
      if (startsWith(head, magic, 8)) return mime;
    }
  }
  // MP3 không có thẻ ID3 thì mở đầu thẳng bằng đồng bộ khung: 11 bit 1 liên tiếp.
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "audio/mpeg";

  return MIME_BY_EXTENSION[name.split(".").pop()?.toLowerCase() ?? ""] ?? UNKNOWN_MIME;
}
