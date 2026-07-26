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
3. **Study list vs Từ điển cá nhân** — hai hệ "bộ từ tự gom" song song
   (server-only vs IndexedDB). Đề xuất: gộp về MỘT khái niệm bộ sưu tập.

## Giai đoạn 0 — Sửa nền móng (~2–4 ngày)

Vòng lặp học đúng + dữ liệu an toàn + hết báo sai cho người dùng.

- [ ] **Chốt & thực thi quyết định mở #1** (gating) + cập nhật docs.

## Giai đoạn 1 — "Thay áo" (~1–2 tuần)

Evolution UI + engine SRS chuẩn, không đổi IA. Chi tiết token: [DESIGN.md](./DESIGN.md).

### Engine SRS (`review/domain/`)

_(trống — mọi mục engine SRS của giai đoạn 1 đã xong)_

### UI nền (theo DESIGN.md)

_(trống — 11 mục #119-#129 của giai đoạn 1 đã xong)_

### Quick wins lặt vặt (mỗi cái <1h)
- [ ] Key React đồng âm `${term}:${reading}` ở SearchBar:166 + InstantActions:69.
- [ ] Loading state khi confirm tra (nguồn server tới 12 round-trip tuần tự —
  song song hoá luôn bằng Promise.all). `sources.ts:41-63`

## Giai đoạn 2 — "Nhịp ngày" (~2–3 tuần)

Mở app là thấy việc hôm nay. IA đích: [DESIGN.md §IA](./DESIGN.md).

- [ ] Màn "Hôm nay": hero "N từ đến hạn · ~X phút" → vào phiên; streak (store
  activity_log nhẹ, sync best-effort); dải hoạt động 7 ngày; 3 từ hay quên.
- [ ] Onboarding first-run 3 bước + nút "Tải từ điển đề xuất" một chạm
  (importYomitanUrl có sẵn; host zip trên chính server để khỏi vướng CORS).
- [ ] Trang "Từ điển của tôi" hợp nhất (Đã cài · Tự soạn · Chia sẻ) — hiện
  "thêm 1 từ" có 5 cửa, "quản lý từ điển" 3 màn, ShareDialog gần như không
  thể khám phá. Thực thi quyết định mở #3 (study list).

## Giai đoạn 3 — "Khu vườn & phần thưởng" (~3 tuần)

- [ ] Khu vườn ký ức: grouping "srs" 3 tầng (Sắp quên/Đang bén rễ/Sắp trưởng
  thành) + nút "Ôn N từ này" theo tầng + popover mini + long-press quick
  actions thay deleteMode toàn cục. `domain/wordcloud.ts`
- [ ] Swipe 4 hướng + haptic cho phiên ôn (route full-screen thay modal);
  hiệu ứng tốt nghiệp (dấu son 合格).
- [ ] Premium chuyển sang giá trị retention (stats nâng cao, backup lịch sử,
  AI ví dụ — hạ tầng Deepseek có sẵn); viết lại modal thành trang giá trị.

## Nợ tài liệu & dọn dẹp

- [ ] Tách styles.css (1089 dòng) theo feature như preset đã làm; quét selector
  chết (.source-toggle). `styles.css:1036`
