// Cổng quyền cho các tính năng có phí. Tách riêng để nơi gác cổng có một tên rõ
// ràng; #70 về sau có thể thêm quota / hạng khác vào đây mà không đụng route.

import { isPremium } from "../features/auth/userStore.js";

/** Được phép đồng bộ từ điển cá nhân giữa các thiết bị? Hiện = Premium. */
export function canSyncDicts(userId: string): Promise<boolean> {
  return isPremium(userId);
}
