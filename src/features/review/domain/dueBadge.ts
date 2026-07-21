// Số từ đến hạn hiện lên tiêu đề tab + huy hiệu ứng dụng (PWA app badge) để
// nhắc ôn kể cả khi app ở tab nền hoặc đã cài đặt (thu nhỏ). Phần tính chuỗi
// tách riêng ở đây cho dễ test; hiệu ứng DOM/badge nằm ở App.

/** Tiêu đề tab: chèn "(N)" trước tiêu đề gốc khi còn từ đến hạn, giữ nguyên khi hết. */
export function formatDueTitle(dueCount: number, baseTitle: string): string {
  return dueCount > 0 ? `(${dueCount}) ${baseTitle}` : baseTitle;
}
