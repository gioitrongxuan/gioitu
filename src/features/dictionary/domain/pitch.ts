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

// Kana nhỏ (yōon ゃゅょ, nguyên âm nhỏ ぁぃ…) dính vào mora TRƯỚC — không tự thành
// mora. っ/ッ, ー và ん là mora riêng (chuẩn đếm mora tiếng Nhật).
const SMALL_KANA = new Set([..."ぁぃぅぇぉゃゅょゎ", ..."ァィゥェォャュョヮ", "ゕゖ", "ヵヶ"]);

/** Tách một chuỗi kana thành danh sách mora (ghép kana nhỏ vào mora trước). */
export function splitMoras(kana: string): string[] {
  const moras: string[] = [];
  for (const ch of kana) {
    if (SMALL_KANA.has(ch) && moras.length) moras[moras.length - 1] += ch;
    else moras.push(ch);
  }
  return moras;
}

/**
 * Dựng chuỗi accent L/H kiểu Tokyo từ vị trí xuống giọng `drop` (0 = bằng /
 * heiban; 1 = đầu / atamadaka; 2..n = giữa / cuối). Chuỗi dài `moraCount + 1`:
 * ký tự cuối là cao-độ của trợ từ theo sau (khớp cách parsePitch đọc ô dư).
 */
export function accentPattern(moraCount: number, drop: number): string {
  if (moraCount <= 0) return "";
  const d = Math.max(0, Math.min(drop, moraCount));
  // Mora đầu cao chỉ khi atamadaka (d=1); các mora sau cao khi bằng (heiban) hoặc
  // còn trước điểm xuống giọng (1 ≤ i < d).
  const highAt = (i: number): boolean => (i === 0 ? d === 1 : d === 0 || i < d);
  let out = "";
  for (let i = 0; i < moraCount; i++) out += highAt(i) ? "H" : "L";
  // Trợ từ theo sau: chỉ cao khi bằng (heiban) — mọi kiểu có xuống giọng đều thấp.
  out += d === 0 ? "H" : "L";
  return out;
}

/**
 * Suy vị trí xuống giọng (0 = bằng; 1 = đầu; n = mora cuối cùng cao) từ một chuỗi
 * accent + danh sách mora. Nghịch đảo (xấp xỉ) của accentPattern để nạp lại pitch
 * có sẵn vào form sửa. 0 khi không đọc được.
 */
export function accentDrop(accent: string | undefined, moras: string[]): number {
  const parsed = parsePitch(accent, moras);
  if (!parsed) return 0;
  const dropIdx = parsed.moras.findIndex((m) => m.dropsAfter);
  return dropIdx >= 0 ? dropIdx + 1 : 0;
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
