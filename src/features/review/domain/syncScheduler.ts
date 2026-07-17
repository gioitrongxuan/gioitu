// Bộ hẹn giờ đồng bộ theo sự kiện: gộp một loạt thay đổi liên tiếp (tra từ,
// chấm thẻ, sửa) thành một lần đẩy lên cloud sau một nhịp ngắn, thay vì phải
// bấm nút "Đồng bộ". Tách khỏi React/DOM để test thuần bằng fake timer.
//
// Vòng đời: `schedule()` hoãn lại lần chạy (mỗi lần gọi lại reset đồng hồ, nên
// một tràng thao tác chỉ tốn một lần chạy); `flush()` chạy ngay lịch đang chờ
// (dùng khi rời tab / đóng phiên, không thể đợi hết debounce); `cancel()` bỏ
// lịch chờ mà không chạy (dùng khi unmount).

export interface SyncScheduler {
  /** Hoãn một lần chạy sau `delayMs`; nhiều lần gọi liên tiếp gộp làm một. */
  schedule(): void;
  /** Chạy ngay nếu đang có lịch chờ, rồi xoá lịch. No-op khi không có gì chờ. */
  flush(): void;
  /** Bỏ lịch chờ mà không chạy. */
  cancel(): void;
}

export function createSyncScheduler(run: () => void, delayMs: number): SyncScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return {
    schedule() {
      clear();
      timer = setTimeout(() => {
        timer = null;
        run();
      }, delayMs);
    },
    flush() {
      if (timer === null) return;
      clear();
      run();
    },
    cancel() {
      clear();
    },
  };
}
