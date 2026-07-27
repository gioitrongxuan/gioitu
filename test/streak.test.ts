import { describe, it, expect } from "vitest";
import { computeStreak, EMPTY_STREAK } from "@/features/review/domain/streak";

// Dựng mốc thời gian theo giờ ĐỊA PHƯƠNG — cùng quy chiếu với dayNumber
// (shared/date) mà domain dùng, nên test không phụ thuộc múi giờ máy chạy CI.
const at = (day: number, hour = 12): number => new Date(2026, 6, day, hour).getTime();

describe("computeStreak", () => {
  it("nhật ký rỗng: chưa có chuỗi nào", () => {
    expect(computeStreak([], at(20))).toEqual(EMPTY_STREAK);
  });

  it("ôn hôm nay lần đầu: chuỗi 1 ngày", () => {
    expect(computeStreak([at(20, 9)], at(20, 22))).toEqual({ current: 1, longest: 1 });
  });

  it("nhiều lượt chấm trong một ngày vẫn chỉ là một ngày", () => {
    expect(computeStreak([at(20, 0), at(20, 9), at(20, 23)], at(20))).toEqual({
      current: 1,
      longest: 1,
    });
  });

  it("các ngày liên tiếp nối thành chuỗi", () => {
    expect(computeStreak([at(18), at(19), at(20)], at(20))).toEqual({ current: 3, longest: 3 });
  });

  it("không phụ thuộc thứ tự mốc thời gian đầu vào", () => {
    expect(computeStreak([at(20), at(18), at(19)], at(20))).toEqual({ current: 3, longest: 3 });
  });

  it("hôm nay chưa ôn nhưng hôm qua có: chuỗi chưa đứt", () => {
    expect(computeStreak([at(18), at(19)], at(20))).toEqual({ current: 2, longest: 2 });
  });

  it("bỏ hai ngày là đứt chuỗi, nhưng chuỗi dài nhất giữ nguyên", () => {
    expect(computeStreak([at(15), at(16), at(17)], at(20))).toEqual({ current: 0, longest: 3 });
  });

  it("chuỗi mới ngắn hơn không kéo tụt chuỗi dài nhất trong quá khứ", () => {
    const log = [at(1), at(2), at(3), at(4), at(19), at(20)];
    expect(computeStreak(log, at(20))).toEqual({ current: 2, longest: 4 });
  });

  it("khoảng trống giữa nhật ký chỉ cắt chuỗi tại chỗ trống", () => {
    const log = [at(10), at(12), at(13), at(14)];
    expect(computeStreak(log, at(14))).toEqual({ current: 3, longest: 3 });
  });

  it("ranh giới ngày tính theo 0h địa phương: 23h59 và 0h01 hôm sau là hai ngày kề nhau", () => {
    const lateNight = new Date(2026, 6, 19, 23, 59).getTime();
    const earlyMorning = new Date(2026, 6, 20, 0, 1).getTime();
    expect(computeStreak([lateNight, earlyMorning], at(20))).toEqual({ current: 2, longest: 2 });
  });
});
