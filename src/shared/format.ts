// Friendly duration formatting (SPEC 5: srs_interval stored in minutes).

export function formatInterval(minutes: number): string {
  if (minutes < 1) return "<1 phút";
  if (minutes < 60) return `${Math.round(minutes)} phút`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} giờ`;
  const days = hours / 24;
  if (days < 30) return `${days.toFixed(days < 10 ? 1 : 0)} ngày`;
  const months = days / 30;
  return `${months.toFixed(1)} tháng`;
}

export function formatRelative(ts: number | null, now = Date.now()): string {
  if (ts == null) return "—";
  const diffMin = (ts - now) / 60000;
  if (diffMin <= 0) return "đến hạn";
  return `sau ${formatInterval(diffMin)}`;
}

/**
 * "x phút/giờ/ngày trước" cho mốc quá khứ — chiều ngược của formatRelative;
 * xa hơn một tuần thì hiện thẳng ngày, vì "N ngày trước" hết còn trực quan.
 */
export function formatTimeAgo(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút trước`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(ts).toLocaleDateString("vi-VN");
}
