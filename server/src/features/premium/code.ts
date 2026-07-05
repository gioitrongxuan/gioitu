// Sinh mã kích hoạt Premium. Người dùng gõ tay nên dùng bảng chữ không nhập
// nhằng (bỏ 0/O/1/I/L) và chia nhóm cho dễ đọc: XXXX-XXXX-XXXX. Thuần (không
// chạm DB) để test được độc lập.

import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUPS = 3;
const GROUP_LEN = 4;

export function newPremiumCode(): string {
  const bytes = crypto.randomBytes(GROUPS * GROUP_LEN);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  const groups: string[] = [];
  for (let i = 0; i < GROUPS; i++) {
    groups.push(chars.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN).join(""));
  }
  return groups.join("-");
}

/** Chuẩn hoá mã người dùng nhập (bỏ khoảng trắng, viết hoa) để so khớp. */
export function normalizeCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}
