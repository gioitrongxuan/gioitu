# Chọn ngôn ngữ khi ôn tập — design

> Trạng thái: đã duyệt qua brainstorming, chưa implement.

## Vấn đề

`VocabEntry.term_lang` (ja/en) đã có trên mọi thẻ, và `domain/wordcloud.ts` đã
có `CloudLang = "all"|"ja"|"en"` + `filterByLang()` dùng để lọc **hiển thị**
Word Cloud. Nhưng khi bắt đầu một phiên ôn, cả hai điểm vào:

- `App.tsx:603` (nút "Ôn tập hôm nay" trên `FilterBar`, trang Kho từ)
- `App.tsx:631` (nút "Ôn ngay" trên `TodayScreen`, màn Hôm nay)

đều gọi `setReviewQueue(store.dueEntries)` — bơm **toàn bộ** thẻ đến hạn,
không lọc theo ngôn ngữ, dù state `cloudLang` (`App.tsx:263`) đã có sẵn trong
scope. Người dùng không có cách chọn "chỉ ôn tiếng Nhật" hay "chỉ ôn tiếng
Anh" khi bắt đầu phiên.

Riêng nút "Ôn N từ này" theo tầng trí nhớ trên Word Cloud
(`WordCloud.tsx:82`, `:265`) đã đúng từ trước — nó dựng từ
`buildCloud(entries, {lang})` nên đã lọc theo `cloudLang`.

## Không đụng tới

`domain/srs.ts`, `domain/session.ts`, `isDue()`/`isReviewable()` hoàn toàn "mù
ngôn ngữ" và tiếp tục như vậy — thẻ đưa vào phiên ôn thế nào thì engine SM-2
xử lý y hệt bất kể ngôn ngữ. Toàn bộ thay đổi nằm ở tầng gọi (composition
root `App.tsx` + 2 UI liên quan), không phải domain SRS.

## Thiết kế

### Nguồn sự thật

Không tạo khái niệm ngôn ngữ mới. Tái dùng đúng `CloudLang` +
`filterByLang()` đã có ở `domain/wordcloud.ts`. `cloudLang` (state ở
`App.tsx`) tiếp tục là bộ lọc DUY NHẤT áp dụng cho cả Word Cloud (hiển thị)
và phiên ôn (nội dung) — một lựa chọn, nhất quán mọi nơi.

### Các thành phần thay đổi/mới

1. **`domain/cloudLangSettings.ts`** (mới) — `loadCloudLang(): CloudLang`,
   `saveCloudLang(lang: CloudLang): void`. Mirror chính xác
   `domain/reverseModeSettings.ts` đã có trong feature: key localStorage
   `gioitu.cloudLang.v1`, try/catch cho storage không khả dụng (private
   mode) → mặc định `"all"`, giá trị đọc được không thuộc
   `"all"|"ja"|"en"` → coi như mặc định.

2. **`ui/LangSelect.tsx`** (mới) — tách `<select>` "Ngôn ngữ" (hiện đang
   inline trong `CloudViewControls.tsx:23-30`) thành component riêng:
   ```ts
   interface Props { lang: CloudLang; onLangChange: (lang: CloudLang) => void }
   ```
   Đây là lần xuất hiện thứ 3 của markup này (Kho từ, "Đã thuộc", nay thêm
   Hôm nay) — đủ ngưỡng tách theo CLAUDE.md ("lặp đến lần thứ 3 mới tách").

3. **`ui/CloudViewControls.tsx`** — sửa để render `<LangSelect lang={lang}
   onLangChange={onLangChange} />` thay khối `<select>` inline. Props/hành
   vi component không đổi (2 call site hiện tại — `FilterBar.tsx:98`,
   `App.tsx:609` — không cần sửa).

4. **`app/TodayScreen.tsx`** — thêm 2 prop mới vào `TodayScreenProps`:
   - `lang: CloudLang`, `onLangChange: (lang: CloudLang) => void` — render
     `<LangSelect>` trong `<section className="today-hero">`, hiện luôn
     (không ẩn theo điều kiện, tránh giật layout giữa 2 nhánh empty/due).
   - `totalDueCount: number` — số đến hạn KHÔNG lọc, chỉ dùng để chọn đúng
     thông báo ở nhánh trống (xem "Ô trống" dưới). Prop `dueCount` hiện có
     đổi ý nghĩa thành số ĐÃ LỌC theo `lang` — vẫn dùng cho tiêu đề hero,
     `estimateMinutes()`, và điều kiện hiện nút "Ôn ngay".

5. **`app/App.tsx`**:
   - `cloudLang` init bằng `useState<CloudLang>(loadCloudLang)` (lazy
     initializer, giống `reverseModeSettings` đã làm ở
     `ReviewSession.tsx:121`) thay vì `useState("all")`.
   - Thêm handler bọc `setCloudLang` để đồng thời `saveCloudLang(lang)` mỗi
     khi đổi (giống `ReviewSession.tsx:409`); truyền handler này cho mọi
     `onLangChange` hiện có (dòng 601, 612) và cho `TodayScreen` mới.
   - Thêm `const dueEntriesForReview = useMemo(() => filterByLang(store.dueEntries, cloudLang), [store.dueEntries, cloudLang])`.
   - 2 lệnh `setReviewQueue(store.dueEntries)` (dòng 603, 631) đổi thành
     `setReviewQueue(dueEntriesForReview)`.
   - `dueCount={store.dueEntries.length}` truyền cho `FilterBar` (dòng 592)
     và `TodayScreen` (dòng 627) đổi thành `dueEntriesForReview.length`.
   - `TodayScreen` nhận thêm `totalDueCount={store.dueEntries.length}`.
   - **Giữ nguyên** biến `dueCount` ở `App.tsx:320` (dùng cho
     `document.title` + PWA app badge) là số **không lọc** — badge hệ thống
     phản ánh tổng nợ thật, không phụ thuộc bộ lọc UI đang xem.

### Ô trống (empty state) ở `TodayScreen`

Vì hero giờ hiển thị số đã lọc, cần phân biệt "hết nợ thật" với "bị lọc
khỏi tầm nhìn":

- `totalDueCount === 0` → thông báo chung như hiện tại: "Hôm nay không có từ
  đến hạn".
- `totalDueCount > 0 && dueCount === 0` → thông báo riêng nêu rõ ngôn ngữ
  đang lọc (ví dụ "Không có từ tiếng Nhật đến hạn"), `LangSelect` vẫn hiện
  ngay đó để người dùng đổi lại "Cả hai".

`FilterBar` (trang Kho từ) không cần thông báo riêng — nút "Ôn tập hôm nay
(0)" tự giải thích được vì Word Cloud ngay dưới đã lọc cùng ngôn ngữ.

## Kiểm thử

Không có logic domain mới cần unit test: `filterByLang()` đã có sẵn (dùng
lại, không đổi hành vi); `cloudLangSettings.ts` là I/O thuần mirror đúng
pattern `reverseModeSettings.ts` (trong repo hiện không có test riêng cho
loại file này — quá đơn giản để test có ý nghĩa). Phần còn lại là nối dây UI
(`App.tsx`/`TodayScreen`/`FilterBar`), không unit-test được vì môi trường
test là node, không có DOM (theo quy ước dự án ở `CLAUDE.md`).

Xác nhận qua:
- `npm run typecheck` — props mới của `TodayScreen` khớp kiểu ở call site.
- `npm test` — không phá test cũ.
- `npm run dev`, kiểm tra tay: đổi ngôn ngữ ở "Hôm nay" và ở Kho từ đồng bộ
  hai chiều; 2 nhánh ô trống đúng thông báo; reload app giữ lựa chọn.
