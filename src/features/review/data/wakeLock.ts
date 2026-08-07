// Giữ màn hình sáng trong phiên nghe. Giọng đọc của máy tắt theo màn hình, mà
// cả điểm của chế độ nghe là không phải chạm vào máy — để màn tự tắt là hỏng.
//
// Wake Lock vắng mặt ở Safari < 16.4 và vài trình duyệt khác: thiếu thì phiên
// vẫn chạy, chỉ là màn có thể tắt. Không coi đó là lỗi chí mạng.

interface WakeLockSentinel {
  release: () => Promise<void>;
}

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
};

/** Xin giữ màn hình; `null` nếu trình duyệt không hỗ trợ hoặc từ chối. */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    const nav = navigator as WakeLockNavigator;
    return (await nav.wakeLock?.request("screen")) ?? null;
  } catch {
    // Bị từ chối (tab đang ẩn, pin yếu) — phiên nghe vẫn chạy được.
    return null;
  }
}

export async function releaseWakeLock(lock: WakeLockSentinel | null): Promise<void> {
  try {
    await lock?.release();
  } catch {
    /* lock đã tự mất khi tab bị ẩn — không có gì để dọn */
  }
}
