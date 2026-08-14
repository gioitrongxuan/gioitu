# Gioitu — extension "Thêm nhanh từ" (Chrome / Edge)

Bôi đen một từ ở **bất kỳ trang web nào**, soạn nghĩa ngay trên trang rồi lưu
thẳng vào Gioitu — không rời trang đang đọc, không cần mở app trước.

Ba cách gọi (đều hiện **overlay nhỏ ngay cạnh vùng bôi đen**):

- **Chuột phải** trên vùng bôi đen → *"Thêm … vào Gioitu"* (ai cũng biết, không cần nhớ gì).
- **Phím tắt** — mặc định `Ctrl/⌘ + Shift + Y` (đổi được).
- **Bấm biểu tượng extension** trên thanh công cụ.

Trên overlay sửa được mặt chữ / cách đọc / nghĩa và cặp ngôn ngữ (đoán sẵn theo
chữ viết). Bấm **Lưu** → extension mở một tab nền `?add=…&add_save=1`; chính app
ghi vào hàng ôn + hộp thư "Từ nhặt được" rồi tự đóng tab — bạn vẫn ở nguyên
trang. **✨ AI điền** (cần đăng nhập Gioitu ở trình duyệt này) mượn app gọi model
hộ qua một cửa sổ tí hon `?add_ai=1` ở góc màn hình — kết quả `postMessage` về
overlay (chỉ nhận từ đúng origin app), điền vào ô còn trống; từ loại/ví dụ/ghi
chú AI trả thêm được gửi kèm lúc lưu. **Form đầy đủ** mở cửa sổ popup chỉ có
form (`add_solo=1`), mang theo phần đã soạn dở. Trang cấm chèn script
(chrome://, cửa hàng tiện ích…) tự rơi về popup này.

## Từ điển

Lúc **mới cài**, extension mở một tab `<địa chỉ Gioitu>/?dicts=1` — màn cài từ
điển của app: bấm một nút là gói đề xuất tải thẳng vào máy (IndexedDB của app),
tra cứu chạy ngay tại chỗ, kể cả offline. Mở lại bất cứ lúc nào bằng nút **"Cài
từ điển về máy…"** ở trang Tuỳ chọn.

Extension **không giữ bản sao từ điển**: nó chạy ở origin khác nên không đọc
được IndexedDB của app; app vẫn là nơi duy nhất chứa dữ liệu (không nhân đôi
hàng trăm MB, không cần bước build để giải nén .zip trong extension).

Extension không gọi API riêng, không đọc trang ngoài phần bạn chủ động bôi đen —
nên chỉ xin quyền tối thiểu (`contextMenus`, `activeTab`, `scripting`,
`storage`), không cần quyền truy cập mọi trang.

> Cần app hỗ trợ tham số `?add=` (đã có trong Gioitu). Chạy được offline nếu app
> đã cài dạng PWA và đang mở.

## Cài để thử (chưa lên store)

1. Mở `chrome://extensions` (hoặc `edge://extensions`), bật **Developer mode**.
2. **Load unpacked** → chọn thư mục `extension/` này.
3. Vào **Tuỳ chọn** của extension → đặt **Địa chỉ Gioitu** (vd `http://localhost:5173`
   khi dev, hoặc domain đã deploy). Mặc định là `http://localhost:5173`.
4. (Tuỳ chọn) đổi phím tắt tại `chrome://extensions/shortcuts`.

## Cấu hình

- **Địa chỉ Gioitu**: sửa ở trang Tuỳ chọn (lưu trong `chrome.storage.sync`).
  Khi phát hành cho người dùng, sửa hằng `DEFAULT_BASE_URL` ở đầu `background.js`
  thành domain thật để "cài xong dùng luôn" mà không cần bước 3.
- **Phím tắt**: `chrome://extensions/shortcuts` (Chrome không cho extension tự gán).

## Phát hành cho người dùng

- **Chrome Web Store**: tài khoản nhà phát triển (\$5 một lần), nộp thư mục
  `extension/` (nén .zip), duyệt vài ngày. Sau đó người dùng chỉ cần bấm *Cài*.
- **Edge Add-ons**: dùng chung mã, nộp riêng (miễn phí).
- **Firefox**: MV3 tương thích phần lớn, nhưng `background.service_worker` cần đổi
  sang `background.scripts` và đóng gói/nộp qua addons.mozilla.org — làm sau nếu cần.

## Cấu trúc

```
extension/
  manifest.json   # MV3: permissions, context menu, command (hotkey), action
  background.js   # service worker: 3 đường gọi → inject overlay; lưu ngầm / popup
  overlay.js      # form Shadow DOM chèn vào trang (inject theo cử chỉ)
  options.html    # đặt địa chỉ Gioitu + mở màn phím tắt + mở màn cài từ điển
  options.js
  icons/          # icon48/128 (mượn từ public/icons)
```
