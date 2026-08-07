# Chế độ nghe (bulk play sound) — design

> Trạng thái: đã duyệt qua brainstorming, chưa implement.

## Vấn đề

Ôn tập hiện chỉ có một dạng: nhìn thẻ, lật, tự chấm điểm. Người dùng muốn ôn
lúc **không nhìn được màn hình** (nấu ăn, dọn dẹp) — cần một chế độ phát âm
thanh chạy liên tục qua danh sách từ, kiểu đài phát nền.

Dự án hiện **chưa có bất kỳ hạ tầng audio/TTS nào** (`grep` toàn `src/` +
`server/src/` cho `speechSynthesis`/`new Audio`/`<audio>`/`AudioContext`/`.mp3`
đều không ra gì) — dựng từ đầu.

## Quyết định đã chốt

1. **Web Speech API (`speechSynthesis`) + Wake Lock**, thuần client, miễn phí,
   offline. KHÔNG làm TTS phía server sinh file audio.
   - Đánh đổi đã chấp nhận: giọng đọc của máy **ngừng phát khi khoá màn hình
     hoặc chuyển app** trên di động. Kịch bản mục tiêu là *màn hình bật, không
     cần nhìn* (điện thoại dựng trên bàn / ngồi máy tính), Wake Lock giữ màn
     không tự tắt. Phát nền thật khi khoá máy để ngỏ cho PR sau.
2. **Nguồn từ**: từ đang học theo ngôn ngữ đang chọn — đúng tập hiển thị trên
   Bản đồ từ.
3. **Trình tự mỗi từ**: đọc từ **2 lần** → khoảng lặng → đọc nghĩa.
4. **Cách chạy**: xáo trộn, **lặp vô hạn** tới khi người dùng bấm dừng.
5. **Không ghi gì**: không chấm điểm SRS, không ghi `user_data`, không tính
   streak / nhật ký ôn. Thuần đọc dữ liệu ra loa.

## Không đụng tới

`domain/srs.ts`, `domain/session.ts`, `isDue()`, store `user_data` — chế độ
nghe chỉ đọc `entries` từ store, không có đường ghi nào.

## Thiết kế

### Các file

| File | Lớp | Việc |
|---|---|---|
| `review/domain/listen.ts` | thuần | Dựng playlist, nở 1 từ → chuỗi lời đọc, quay vòng |
| `review/domain/listenSettings.ts` | thuần | Lưu tốc độ đọc + độ dài khoảng lặng (localStorage) |
| `review/data/speech.ts` | I/O | Bọc Web Speech API: `speak()`, `cancel()`, dò giọng |
| `review/data/wakeLock.ts` | I/O | Giữ màn hình không tắt trong phiên nghe |
| `review/ui/ListenSession.tsx` + `listen.css` | UI | Màn phát toàn màn hình + điều khiển |

`domain/listen.ts` dùng lại `shuffle()` đang là hàm private trong
`domain/session.ts` — **export nó ra** thay vì chép lại Fisher–Yates (hai
module cùng thư mục `domain/`, không lệch tầng).

### Nguồn từ

```
filterByLang(entries.filter(isVisibleOnCloud), cloudLang)
```

Tức LEARNING + RELAPSED (loại đã xoá, loại LEARNED), tôn trọng bộ lọc ngôn ngữ
`cloudLang` đã có. Đây đúng là tập mà `buildCloud` hiển thị.

Lọc thêm ở tầng playlist: **loại các từ không có nghĩa đọc được** (nghe một từ
trống nghĩa là vô nghĩa).

### Nở một từ thành chuỗi lời đọc

Hàm thuần, trả về danh sách bước:

```
{ speak: term,    lang: term_lang }    // lần 1
{ speak: term,    lang: term_lang }    // lần 2
{ pause: gapMs }                       // khoảng lặng để tự nhớ lại
{ speak: meaning, lang: native_lang }
```

- **Tiếng Nhật đọc kana**: dùng `reading` nếu có, không thì `term` — tránh máy
  đọc sai âm Hán của kanji đứng một mình.
- **Nghĩa**: tối đa 2 dòng đầu từ `meaningToLines(meaning)`, nối bằng `", "`.
- **Locale giọng**: `ja → ja-JP`, `en → en-US`, `vi → vi-VN`.

### Quay vòng

Hết một lượt thì xáo lại bằng seed mới rồi chạy tiếp, vô hạn cho tới khi người
dùng bấm dừng — mỗi vòng thứ tự khác nhau nên không thuộc lòng theo thứ tự.

### UI

- **Điểm vào**: nút "Nghe" cạnh "Ôn tập hôm nay" trong `FilterBar` (trang Bản
  đồ từ) — cùng chỗ với nguồn từ mà nó phát. Tắt khi playlist rỗng.
- **Màn phát**: overlay toàn màn hình như `ReviewSession`; Back/Escape đóng qua
  `useBackEntry` + `useDialog` (DESIGN §3.3).
- **Nội dung**: từ hiện tại chữ rất to (liếc là thấy), kana nhỏ bên dưới, nghĩa
  **chỉ hiện khi tới bước đọc nghĩa** — liếc màn hình vẫn là một lượt tự kiểm
  tra, không lộ đáp án sớm.
- **Điều khiển**: Phát/Tạm dừng to ở giữa (bấm không nhìn nên vượt xa mức 44px
  của DESIGN §3.6), Từ trước / Từ sau hai bên, Kết thúc. Icon SVG inline
  `stroke: currentColor` (DESIGN §3.5) — thêm play/pause/prev/next vào
  `shared/ui/icons`.
- **Hai tuỳ chọn** dùng lại lớp `.sort-select`, lưu localStorage: Tốc độ
  (0.75× / 1× / 1.25×) và Khoảng lặng (2s / 4s / 6s).
- **Phím tắt desktop**: Space phát/dừng, ← → lùi/tới.
- Nhãn tiếng Việt, dùng token DESIGN §2, không thêm magic number / emoji-icon.

### Giới hạn phải xử lý tử tế

| Rủi ro | Cách xử lý |
|---|---|
| Máy không có giọng tiếng Việt (hay gặp trên Chrome/Windows) | Kiểm tra giọng lúc mở màn; thiếu thì hiện cảnh báo nêu đúng thiếu giọng nào, vẫn cho nghe phần còn lại — không im lặng đọc bằng giọng sai |
| `getVoices()` trả rỗng ở lần gọi đầu (Chrome) | Chờ sự kiện `voiceschanged` trong `data/speech.ts` |
| `navigator.wakeLock` vắng (Safari < 16.4) | Optional chaining, thiếu thì vẫn chạy (màn có thể tắt); xin lại lock khi tab quay lại foreground vì lock tự mất lúc ẩn tab |
| Tab bị ẩn / khoá màn | Tự tạm dừng, để không đọc vào hư không rồi lệch vị trí |
| Bug Chrome cắt tiếng khi phát dài | Timeout dự phòng trong `speak()` để chuỗi không treo |

## Kiểm thử

Test vitest cho `domain/listen.ts` + `domain/listenSettings.ts` (thuần, chạy
được ở môi trường node không DOM):

- Playlist lọc đúng ngôn ngữ và loại từ không có nghĩa đọc được.
- Xáo trộn với `rng` giả định cho kết quả tất định.
- Chuỗi lời đọc đúng thứ tự từ → từ → lặng → nghĩa.
- Chọn kana khi có `reading`, rơi về `term` khi không.
- Cắt nghĩa tối đa 2 dòng.
- Quay vòng: hết lượt thì sang vòng mới, không dừng.
- Settings: giá trị lạ / storage lỗi → về mặc định.

`data/speech.ts`, `data/wakeLock.ts` và UI là I/O trình duyệt, không unit-test
(môi trường test là node, không DOM) → kiểm thử tay trên Chrome: nghe được cả
hai giọng, tạm dừng/tiếp tục, lùi/tới, quay vòng, đóng phiên thì tắt tiếng và
nhả wake lock.

Cập nhật `docs/FEATURES.md` theo quy ước dự án cho PR thêm tính năng.
