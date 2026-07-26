// Logic thuần cho precache của service worker (public/sw.js): nhặt danh sách
// asset từ bundle build và chèn vào chỗ placeholder trong sw.js. sw.js là file
// public/ copy nguyên trạng — không qua pipeline bundle nên không tự biết tên
// các chunk có hash; plugin sw-precache trong vite.config.ts bọc I/O quanh hai
// hàm này lúc build. Tách ra đây để test được bằng vitest.

// Nguyên văn literal trong public/sw.js (kể cả dấu nháy) — build thay cả cụm
// bằng mảng JSON. Đổi tên ở đây thì phải đổi đồng bộ trong sw.js.
export const SW_BUILD_ASSETS_PLACEHOLDER = '"__SW_BUILD_ASSETS__"';

/**
 * Nhặt đường dẫn cần precache từ danh sách file của bundle (key của hook
 * `generateBundle`). Chỉ lấy `assets/*`: tên có hash nên bất biến, precache một
 * lần là xong; `index.html` và file public/ (icon, manifest) đã thuộc SHELL của
 * sw.js. Bỏ sourcemap — chỉ devtools cần, nặng vô ích cho offline. Sắp xếp để
 * đầu ra ổn định: byte của sw.js chỉ đổi khi nội dung build thật sự đổi.
 */
export function collectBuildAssets(bundleFileNames: readonly string[]): string[] {
  return bundleFileNames
    .filter((name) => name.startsWith("assets/") && !name.endsWith(".map"))
    .map((name) => `/${name}`)
    .sort();
}

/**
 * Chèn danh sách asset vào nguồn sw.js. Thiếu placeholder thì ném lỗi cho build
 * fail to tiếng — im lặng bỏ qua sẽ cho ra bản deploy không precache được chunk
 * lazy và không bao giờ dọn asset cũ, đúng cái lỗi ta đang sửa.
 */
export function injectBuildAssets(swSource: string, assets: readonly string[]): string {
  if (!swSource.includes(SW_BUILD_ASSETS_PLACEHOLDER)) {
    throw new Error(`public/sw.js thiếu placeholder ${SW_BUILD_ASSETS_PLACEHOLDER}`);
  }
  return swSource.replace(SW_BUILD_ASSETS_PLACEHOLDER, JSON.stringify(assets));
}
