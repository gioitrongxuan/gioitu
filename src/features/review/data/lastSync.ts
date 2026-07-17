// Mốc thời gian lần đồng bộ dữ liệu học THÀNH CÔNG gần nhất, để hiển thị "đồng
// bộ lần cuối hh:mm". Lưu theo user_id (mỗi tài khoản một mốc riêng) trong
// localStorage. Chỉ dữ liệu người đăng nhập mới lên cloud nên khách không ghi mốc.

const KEY_PREFIX = "gioitu.lastSync.v1";

/** localStorage có thể vắng (Node/SSR/test) — hạ cấp êm như auth.ts. */
function storage(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function keyFor(user_id: string): string {
  return `${KEY_PREFIX}:${user_id}`;
}

export function readLastSync(user_id: string): number | null {
  const raw = storage()?.getItem(keyFor(user_id));
  if (!raw) return null;
  const ts = Number(raw);
  return Number.isFinite(ts) ? ts : null;
}

export function writeLastSync(user_id: string, ts: number): void {
  storage()?.setItem(keyFor(user_id), String(ts));
}
