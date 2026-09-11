# Gioitu — extension "Chiết tự chữ Hán" (Chrome / Edge)

**Rê chuột vào một chữ Hán** ở bất kỳ trang web nào (lối Yomitan) là thấy ngay
chữ ấy được dựng nên thế nào — tượng hình · chỉ sự · hội ý · hình thanh… — kèm
Hán-Việt, nghĩa, âm On/Kun, số nét. Thẻ chỉ nêu **nhãn**, không giảng giải: chữ
con ngay bên dưới đã nói đủ, và phân loại của nguồn cũng không phải lúc nào cũng
chắc.

Mỗi **chữ con** (bộ phận, phần nghĩa, phần âm) hiện kèm **Hán-Việt + nghĩa + âm
On của chính nó** — 河 = 氵 THUỶ·nước + 可 KHẢ·có thể — chứ không bắt bạn đi tra
tiếp. Dưới cùng là **họ chữ, hai chiều**: *cùng phần âm* (可 → 何 荷 歌, đều đọc カ) và
*cùng bộ* (水 → 海 池 湖, đều chuyện nước nôi) — học một chữ đoán được cả họ. Tra
đúng chữ đứng đầu họ thì danh sách đổi chiều thành "Những chữ dùng 水 làm bộ".
Mỗi họ 10 chữ hay gặp nhất.

Không muốn bật rê chuột thì vẫn dùng được bằng cử chỉ, trên phần **bôi đen**:

- **Chuột phải** → *"Chiết tự …"*
- **Phím tắt** — mặc định `Ctrl/⌘ + Shift + K` (đổi được)
- **Bấm biểu tượng extension** trên thanh công cụ

## Quyền — hai thứ, xin riêng

Extension không nhét quyền nào vào manifest; tất cả là `optional_host_permissions`
xin ngay trên trang **Tuỳ chọn**:

1. **Địa chỉ Gioitu** (bắt buộc): để gọi `<địa chỉ>/api/kanji`.
2. **Mọi trang** (chỉ khi bật rê chuột): content script phải nằm sẵn trên trang
   thì mới dò được chữ dưới con trỏ. Tắt rê chuột là extension **trả lại quyền**
   và gỡ content script khỏi mọi trang (`chrome.scripting.unregisterContentScripts`).

Extension chỉ dò ký tự ngay dưới con trỏ (hoặc phần bạn bôi đen), không đọc gì
khác của trang, không gửi gì đi đâu ngoài chữ cần tra.

## Dữ liệu và tốc độ

Dữ liệu cấu tạo chữ nằm ở **bảng kanji trên máy chủ Gioitu** — extension không
giữ bản sao. Khác extension "Thêm nhanh từ" (phải mượn app tra hộ vì từ điển nằm
trong IndexedDB của origin app), ở đây `/api/kanji` là route **công khai
chỉ-đọc** nên extension gọi thẳng: rê chuột mà mỗi lần lại mở một cửa sổ app thì
không thể dùng được.

Tốc độ đến từ ba chỗ:

- **Cache vô thời hạn** (dữ liệu kanji tĩnh), nhớ cả "máy chủ không có chữ này"
  nên chữ trống không bị hỏi lại; có bản sao xuống đĩa để service worker ngủ dậy
  vẫn trả lời ngay. Lỗi mạng thì **không** nhớ — lần sau vẫn hỏi lại.
- **Hai nhịp**: thẻ hiện ngay sau lượt hỏi đầu, phần chữ con + họ chữ dày thêm sau.
- **Hỏi trước chữ liền kề**: tra xong một chữ thì hỏi luôn dải chữ Hán quanh nó,
  rê sang chữ bên cạnh là hiện liền.

Cần máy chủ đã nhập dữ liệu kanji (`npm run import:kanjidic`). Máy chủ vắng hoặc
mất mạng thì thẻ nói thẳng "không tra được", không báo nhầm thành "chữ này chưa
có dữ liệu".

## Cài để thử (chưa lên store)

1. Mở `chrome://extensions` (hoặc `edge://extensions`), bật **Developer mode**.
2. **Load unpacked** → chọn thư mục `extension-chiettu/` này.
3. Trang **Tuỳ chọn** tự mở lúc mới cài → nhập **Địa chỉ Gioitu** (vd
   `http://localhost:5173` khi dev), bấm **Lưu**, rồi **Cấp quyền truy cập địa
   chỉ này**.
4. Muốn rê chuột thì bật **"Rê chuột vào chữ là hiện thẻ"** và đồng ý khi trình
   duyệt hỏi quyền đọc trang.
5. (Tuỳ chọn) đổi phím tắt tại `chrome://extensions/shortcuts`.

Khi phát hành cho người dùng, sửa hằng `DEFAULT_BASE_URL` ở đầu `background.js`
thành domain thật để bước 3 chỉ còn một cú bấm cấp quyền.

## Cấu trúc

```
extension-chiettu/
  manifest.json    # MV3: quyền tối thiểu + optional_host_permissions
  background.js    # service worker (module): gọi API, cache, quyền, đăng ký
                   # content script động, context menu / phím tắt / nút toolbar
  kanji-api.js     # gọi /api/kanji + cache (JS thuần — test/kanjiApi.test.ts)
  kanji-cards.js   # dựng thẻ: lục thư, chữ con, họ chữ (test/kanjiCards.test.ts)
  content.js       # dò chữ dưới con trỏ, vòng đời thẻ trên trang
  card.js          # vẽ thẻ (Shadow DOM)
  options.html/js  # địa chỉ Gioitu, cấp quyền, bật/tắt rê chuột, phím & độ trễ
  icons/           # icon48/128 (mượn từ public/icons)
```

`kanji-api.js` và `kanji-cards.js` cố ý không chạm `chrome.*` lẫn DOM để chạy
được dưới vitest — extension không có bước build nên chúng là JS thuần, nhưng
vẫn được test như mọi logic khác của dự án. Xem FEATURES §9.24.

## Quan hệ với extension "Thêm nhanh từ"

Hai extension **độc lập**, cài riêng, mỗi cái một việc: `extension/` lượm từ vào
hàng ôn SRS, `extension-chiettu/` chỉ giải thích cấu tạo chữ. Chúng KHÔNG dùng
chung đường dữ liệu (một bên mượn app, một bên gọi API) — lý do ở ngay trên.
