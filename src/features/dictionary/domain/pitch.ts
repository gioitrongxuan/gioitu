// Pitch accent (giọng cao thấp) — parse chuỗi accent kiểu Mazii ("LHHHHLL-L")
// căn theo danh sách mora, thành mô hình để vẽ sơ đồ kiểu jisho/OJAD. Thuần → test được.
//
// Chuỗi accent gồm L/H cho từng mora; phần dư cuối (vd "-L") là cao-độ của TRỢ TỪ
// đi sau (jisho cũng hiển thị ô này). Ta bỏ ký tự ngăn cách, căn L/H theo mora,
// đánh dấu "xuống giọng" ở mora cao mà mora kế là thấp.

export interface PitchMora {
  mora: string;
  high: boolean;
  /** Có bước xuống giọng ngay sau mora này (cao → thấp). */
  dropsAfter: boolean;
}

export interface ParsedPitch {
  moras: PitchMora[];
  /** Cao-độ của trợ từ theo sau (null nếu chuỗi không có ô dư). */
  particleHigh: boolean | null;
}

export function parsePitch(accent: string | undefined, moras: string[]): ParsedPitch | null {
  if (!moras.length) return null;
  const pattern = (accent ?? "").replace(/[^LHlh]/g, "").toUpperCase();
  if (!pattern) return null;

  const isHigh = (i: number): boolean => pattern[i] === "H";
  const out: PitchMora[] = moras.map((mora, i) => {
    const high = isHigh(i);
    const nextHigh = i + 1 < pattern.length ? isHigh(i + 1) : false;
    return { mora, high, dropsAfter: high && !nextHigh };
  });
  const particleHigh = pattern.length > moras.length ? isHigh(moras.length) : null;
  return { moras: out, particleHigh };
}
