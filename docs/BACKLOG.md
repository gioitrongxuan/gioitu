# BACKLOG — kết quả audit 07/2026

> Nguồn: audit đa agent 10–11/07/2026 (8 chiều, 91 phát hiện; mọi phát hiện
> major/critical dạng khẳng định hành vi code đã được agent phản biện độc lập
> xác nhận trên code thật — 32/32 confirmed). File này là **bản đồ việc cần
> làm**: trước khi nhận một task cải thiện, đọc mục tương ứng ở đây thay vì
> quét lại codebase. Mỗi mục có găm `file:dòng` tại thời điểm audit (có thể
> trôi vài dòng sau khi sửa — dùng làm điểm nhảy, không phải chân lý).
>
> **Quy ước bảo trì**: làm xong mục nào thì xoá mục đó (git giữ lịch sử);
> mỗi PR nên khớp 1 mục hoặc 1 cụm mục cùng file. Hệ thị giác & quy tắc UI:
> [DESIGN.md](./DESIGN.md).

## Quyết định mở (cần chốt trước khi làm mục liên quan)

1. **Triết lý gating** — code hiện tại: tra cứu thường KHÔNG được ghi nhận,
   thẻ SRS tạo ngay lần bấm "+" đầu (`lookup.ts:36-59` "no gating";
   `useLookup.ts:65-68`). Docs/README vẫn mô tả "tra ≥2 lần mới vào queue".
   Phương án đề xuất: giữ "+" = tạo thẻ chủ đích, **khôi phục đếm lượt tra
   thụ động** (không tạo thẻ) để Word Cloud là bản đồ quên thật và relapse
   tự động sống lại. Chốt xong phải sửa docs đồng bộ (README §triết lý,
   LOGIC §1/§3, FEATURES).
2. **"Tự khai đã thuộc"** — 3 UI nhảy thẳng LEARNED (✓ DetailPanel,
   quick-mark KanjiStats, double-click VocabStudy) mâu thuẫn ràng buộc SPEC #7
   "tốt nghiệp bằng ngưỡng, không bằng nút". Đề xuất: nâng thành khái niệm
   chính thức (cờ nguồn riêng, đếm riêng "N từ · M kanji tự đánh dấu").
   Đã có mốc đầu: đánh dấu hàng loạt khi sàng bộ từ (FEATURES §9.21) đóng dấu
   `VocabEntry.learned_source = "sieve"`. Chốt xong thì mở rộng cờ này cho 3 UI
   tự khai lẻ còn lại.
3. **Study list vs Từ điển cá nhân** — hai hệ "bộ từ tự gom" song song
   (server-only vs IndexedDB). Đề xuất: gộp về MỘT khái niệm bộ sưu tập.
   Lưu ý: "bộ từ nhập ngoài" (store `wordsets`, FEATURES §9.21) cố ý KHÔNG phải
   khái niệm thứ ba cần gộp — nó là danh sách tham chiếu chỉ đọc, không sửa,
   không đồng bộ, xoá lúc nào cũng được.

## Giai đoạn 0 — Sửa nền móng (~2–4 ngày)

Vòng lặp học đúng + dữ liệu an toàn + hết báo sai cho người dùng.

- [ ] **Chốt & thực thi quyết định mở #1** (gating) + cập nhật docs.
- [ ] **`review_log` không đồng bộ đa thiết bị** — dải hoạt động 7 ngày +
  streak ở màn "Hôm nay" đọc thẳng từ store `review_log` trong IndexedDB
  local (`todayStats.ts:16` → `reviewLog.ts:23`), store này chưa từng đồng bộ
  lên cloud (xem comment đầu `reviewLog.ts`, server `features/sync/` chỉ xử
  lý `user_data`). Kết quả: cùng một tài khoản đăng nhập nhưng ôn trên điện
  thoại thì streak/dải hoạt động trên máy tính không thấy, và ngược lại.
  Hướng sửa: đồng bộ `review_log` lên cloud (kiểu LWW/append giống
  `user_data`) hoặc suy activity/streak từ một nguồn đã đồng bộ.

## Giai đoạn 1 — "Thay áo" (~1–2 tuần)

Evolution UI + engine SRS chuẩn, không đổi IA. Chi tiết token: [DESIGN.md](./DESIGN.md).

### Engine SRS (`review/domain/`)

_(trống — mọi mục engine SRS của giai đoạn 1 đã xong)_

### UI nền (theo DESIGN.md)

_(trống — 11 mục #119-#129 của giai đoạn 1 đã xong)_

### Quick wins lặt vặt (mỗi cái <1h)

_(trống — key React đồng âm đã xong ở SearchBar/InstantActions; sources.ts đã
song song hoá bằng Promise.all và useLookup có cờ `pending`)_

## Giai đoạn 2 — "Nhịp ngày" (~2–3 tuần)

Mở app là thấy việc hôm nay. IA đích: [DESIGN.md §IA](./DESIGN.md).

- [ ] Trang "Từ điển của tôi" hợp nhất (Đã cài · Tự soạn · Chia sẻ) — hiện
  "thêm 1 từ" có 5 cửa, "quản lý từ điển" 3 màn, ShareDialog gần như không
  thể khám phá. Thực thi quyết định mở #3 (study list).

## Giai đoạn 3 — "Khu vườn & phần thưởng" (~3 tuần)

_(trống — cả ba mục giai đoạn 3 đã xong)_

## Nợ tài liệu & dọn dẹp

_(trống — styles.css đã tách theo feature, #168)_
