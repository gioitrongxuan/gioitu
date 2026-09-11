# Gioitu — extension "Chiết tự chữ Hán" (Chrome / Edge)

Bôi đen chữ Hán ở **bất kỳ trang web nào** để xem chữ ấy được dựng nên thế nào:
**tượng hình** (vẽ lại vật), **chỉ sự** (dấu hiệu quy ước), **hội ý** (ghép
nghĩa), hay **hình thanh** (một phần chỉ nghĩa, một phần chỉ âm) — kèm Hán-Việt,
âm On/Kun, số nét và các bộ phận cấu thành.

Ba cách gọi (đều hiện **thẻ nhỏ ngay cạnh vùng bôi đen**):

- **Chuột phải** trên vùng bôi đen → *"Chiết tự …"*.
- **Phím tắt** — mặc định `Ctrl/⌘ + Shift + K` (đổi được).
- **Bấm biểu tượng extension** trên thanh công cụ.

Thẻ liệt kê sẵn các chữ Hán rút được (tối đa 8 chữ, bỏ chữ lặp) và có nút
**Chiết tự**. Phải **bấm** nút ấy: lúc thẻ vừa hiện ra, trang chưa có "user
activation" nên trình duyệt chặn mọi `window.open` — một cú bấm mới mở được cửa
sổ hỏi app. Bấm xong, mỗi chữ thành một thẻ; chữ hình thanh tô riêng **phần
nghĩa** (viền xanh) và **phần âm** (viền cam) — nhìn phần âm là đoán được cách
đọc của cả họ chữ.

## Dữ liệu lấy từ đâu

Extension **không giữ bản sao dữ liệu và không gọi API nào**: nó chạy ở origin
khác nên không đọc được dữ liệu của app. Nó mở một cửa sổ tí hon
`<địa chỉ Gioitu>/?kanji=<phần bôi đen>`; chính app hỏi `/api/kanji`, dựng thẻ
rồi `postMessage` về trang đang đọc và tự đóng (đúng khuôn `?lookup=` mà
extension "Thêm nhanh từ" đã dùng — quyết định #251). Overlay chỉ nhận message
từ đúng origin app, đúng `kind`, đúng phần bôi đen đang hỏi.

Hệ quả: **chiết tự cần mạng** và cần máy chủ Gioitu đã nhập dữ liệu kanji
(`npm run import:kanjidic`). Dữ liệu cấu tạo chữ chưa bao giờ nằm trong từ điển
tải về IndexedDB nên không có đường chạy offline — thẻ nói thẳng "không chiết tự
được" khi mất mạng, chứ không báo nhầm thành "chữ này chưa có dữ liệu".

Extension không đọc trang ngoài phần bạn chủ động bôi đen — nên chỉ xin quyền
tối thiểu (`contextMenus`, `activeTab`, `scripting`, `storage`), không cần quyền
truy cập mọi trang. Trang cấm chèn script (chrome://, cửa hàng tiện ích, trình
xem PDF nội bộ…) thì rơi về mở thẳng trang từ trong app (`/word/ja-vi/<từ>`) —
ở đó có phần "Chữ Hán" của Detail Panel, ít hơn thẻ chiết tự nhưng còn hơn không.

## Cài để thử (chưa lên store)

1. Mở `chrome://extensions` (hoặc `edge://extensions`), bật **Developer mode**.
2. **Load unpacked** → chọn thư mục `extension-chiettu/` này.
3. Trang **Tuỳ chọn** tự mở lúc mới cài → đặt **Địa chỉ Gioitu** (vd
   `http://localhost:5173` khi dev, hoặc domain đã deploy). Mặc định là
   `http://localhost:5173`.
4. (Tuỳ chọn) đổi phím tắt tại `chrome://extensions/shortcuts`.

## Cấu hình

- **Địa chỉ Gioitu**: sửa ở trang Tuỳ chọn (lưu trong `chrome.storage.sync`).
  Khi phát hành cho người dùng, sửa hằng `DEFAULT_BASE_URL` ở đầu `background.js`
  thành domain thật để "cài xong dùng luôn" mà không cần bước 3.
- **Phím tắt**: `chrome://extensions/shortcuts` (Chrome không cho extension tự gán).

## Quan hệ với extension "Thêm nhanh từ"

Hai extension **độc lập**, cài riêng, mỗi cái một việc: `extension/` lượm từ vào
hàng ôn SRS, `extension-chiettu/` chỉ giải thích cấu tạo chữ (không ghi gì vào
dữ liệu học). Chúng dùng chung lối "nhờ app làm hộ qua cửa sổ tí hon" nên sửa
khuôn ấy ở bên nào thì soi bên kia.

## Cấu trúc

```
extension-chiettu/
  manifest.json   # MV3: permissions, context menu, command (hotkey), action
  background.js   # service worker: 3 đường gọi → inject overlay; fallback mở app
  overlay.js      # thẻ chiết tự Shadow DOM chèn vào trang (inject theo cử chỉ)
  options.html    # đặt địa chỉ Gioitu + mở màn phím tắt
  options.js
  icons/          # icon48/128 (mượn từ public/icons)
```

Phía app: `dictionary/domain/kanjiProxy.ts` (logic thuần — đọc param, rút chữ
Hán, diễn giải lục thư sang tiếng Việt, dựng payload),
`dictionary/data/kanjiProxy.ts` (gọi `/api/kanji`), và effect `?kanji=` trong
`app/App.tsx`. Xem FEATURES §9.24.
