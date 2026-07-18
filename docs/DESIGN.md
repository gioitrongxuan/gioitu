# DESIGN — hệ thị giác & quy tắc UI

> Đây là **hệ quy chiếu cho mọi PR chạm UI**: token, quy tắc bắt buộc, và IA
> đích. Trạng thái: *đích đến đã chốt 07/2026, áp dụng dần* — khi sửa một
> component, map giá trị cũ sang token ở đây thay vì thêm magic number mới.
> Việc triển khai theo giai đoạn nằm ở [BACKLOG.md](./BACKLOG.md).

## 1. Cá tính: washi/sumi — tối giản Nhật, gamification tiết chế

Palette hiện tại (#2563eb trên #f6f7f9) vay của Tailwind, không có bản sắc.
Hướng đích: giấy washi ấm + mực sumi + chàm aizome cho tương tác, và **son đỏ
shu-iro dành riêng cho thành tựu** (hanko streak, badge tốt nghiệp 合格) —
tách khỏi `--warn` để "đỏ thành tựu" không loãng với "đỏ cảnh báo".

| Token | Light (washi) | Dark (yozora) | Vai trò |
|---|---|---|---|
| `--bg` | `#f7f4ee` | `#141317` | nền trang |
| `--surface` | `#fffdf9` | `#1e1d22` | card/panel |
| `--fg` | `#211f1a` | `#e8e4da` | chữ |
| `--muted` | `#6f6a5d` | `#a29c8c` | chữ phụ |
| `--line` | `#e3dccb` | `#37343c` | viền |
| `--accent` | `#2b4c7e` | `#8fb0dd` | tương tác (aizome) |
| `--seal` | `#c73e2e` | `#e2705a` | CHỈ thành tựu (shu-iro) |

Giữ nguyên hợp đồng 9 biến của `theme/domain/theme.ts` (VAR_MAP) — preset và
color-mix dẫn xuất tự ăn theo. Dark mode phải có nhánh
`@media (prefers-color-scheme: dark)` tĩnh + inline script trong `<head>` đọc
localStorage trước paint (chống flash trắng).

> **Đã dựng** (token layer): palette washi + `--seal` ở `:root`, nhánh `@media
> (prefers-color-scheme: dark)` yozora, và inline script chống nháy trong
> `index.html`. `DEFAULT_THEME`/`DARK_THEME` (theme.ts) đã khớp bảng trên. `--warn`
> và hai đầu heatmap chưa nằm trong bảng nên giữ giá trị cũ (chờ mục tag/heatmap).

**Theme anime (panda/buu/cell/akatsuki)**: định vị là *skin sưu tầm opt-in* —
chỉ đổi backdrop + heatmap + emblem trang trí, KHÔNG đụng token chữ/nền
(giữ tương phản), KHÔNG thay glyph cảnh báo relapse bằng glyph dễ thương.
Color-picker tự do → mục "Nâng cao" thu gọn.

## 2. Token scales (thêm vào `:root` của styles.css)

> **Đã dựng** toàn bộ thang dưới đây trong `styles.css:root` (spacing/radius/
> shadow/motion/type/z-index/control + `--focus-ring`). Các mục UI sau tiêu thụ
> dần thay magic number; PR token layer CHỈ khai báo, chưa refactor nơi dùng.

- **Spacing** — thang 4px: `--space-1:4 · 2:8 · 3:12 · 4:16 · 5:20 · 6:24 · 8:32`.
- **Radius** — `--radius-xs:6 · sm:8 · md:10 · lg:14 · xl:18 · full:999`.
  Map: chip → xs/sm; control & dropdown → md/lg; input/search → lg;
  card → lg; modal → xl.
- **Shadow** — 3 bậc 2 lớp: `--shadow-sm` (card tĩnh), `--shadow-md`
  (dropdown), `--shadow-lg` (modal), `--shadow-sheet` (bottom sheet).
  Theme tối cần bóng đậm hơn (biến cường độ).
- **Motion** — `--dur-fast:120ms · --dur-base:200ms · --dur-slow:320ms`;
  `--ease-out: cubic-bezier(.2,0,0,1)`; hover màu = fast, transform/xuất hiện
  = base, sheet/overlay = slow. Cấm transition 0.05s (cảm giác giật).
- **Type** — thang `11 / 13 / 15 / 16 / 18 / 22 / 26 / 30px`
  (`--text-xs · sm · base · md · lg · xl · 2xl · 3xl`); body 15-16px,
  line-height 1.6 nội dung / 1.3 heading (`--leading-body · --leading-heading`);
  `tabular-nums` cho mọi số đếm (progress, interval, đếm due). Font: giữ
  system-first cho `--font-ja` (offline-first); khi self-host thì Inter subset
  latin+vietnamese cho UI, Noto Sans JP chèn SAU Hiragino TRƯỚC Yu Gothic
  (macOS không tải gì).
- **Z-index** — đặt thang tên: dropdown 20 · sheet 30 · modal 40 · toast 50.
- **Control** — height thống nhất 38px (header) / 48px (search hero);
  focus ring: `0 0 0 3px color-mix(in oklab, var(--accent) 25%, transparent)`.

## 3. Quy tắc bắt buộc cho mọi PR UI (checklist)

1. **Tiếng Việt** cho mọi nhãn/thông báo (đúng CLAUDE.md). Nhãn chấm điểm:
   Quên / Khó / Nhớ / Dễ.
2. **Không magic number mới** — dùng token §2; thấy giá trị lệch thang thì map
   về token gần nhất.
3. **Bàn phím**: mọi element tương tác có `:focus-visible` (rule toàn cục);
   overlay mới phải dùng hook `useDialog` chung (Escape đóng, focus đầu, trả
   focus, `aria-modal`); list/dropdown điều hướng được bằng mũi tên.
4. **Contrast ≥ 4.5:1** cho chữ thường (WCAG AA). Màu ngữ nghĩa không hardcode
   hex rời — chip nhạt: nền `color-mix(... 12-14%, var(--surface))` + chữ đậm.
5. **Icon = SVG inline** `stroke: currentColor`, cỡ 16/20px. Không thêm emoji
   làm icon chức năng.
6. **Touch**: target ≥ 44px trong `@media (pointer: coarse)`; hành động phá
   huỷ có confirm hoặc undo-toast; không dùng double-click/double-tap làm
   hành động chính.
7. **Mobile input**: font-size ≥ 16px (chống iOS auto-zoom); input tiếng Nhật
   có `lang`, `enterkeyhint`; chữ Nhật luôn bọc `lang="ja"`.
8. **Motion**: chỉ animate transform/opacity; mọi animation nằm sau guard
   `prefers-reduced-motion` (guard toàn cục, không per-component).
9. **Trạng thái**: mọi thao tác async có loading (skeleton shimmer, không text
   trơ); lỗi mạng phải phân biệt được với "không có dữ liệu"; phản hồi UI chỉ
   xác nhận điều đã thực sự xảy ra (không setAdded trước khi ghi nhận).
10. **CSS mới của feature** đặt cạnh feature (như presets đã làm), styles.css
    chỉ giữ reset + token + layout khung.

## 4. IA đích: 4 khu

```
Hôm nay   — hero "N từ đến hạn · ~X phút" → phiên ôn; streak hanko;
            dải hoạt động 7 ngày; từ hay quên nhất; ô tìm thu gọn.
Tra cứu   — SearchBar + DetailPanel + viết tay/bộ thủ + cặp/nguồn + import.
            Deep-link /word/:lang/:term.
Kho từ    — Word Cloud ("Khu vườn ký ức": 3 tầng Sắp quên / Đang bén rễ /
            Sắp trưởng thành, ôn theo tầng) · Đã thuộc · Thống kê kanji ·
            Học từ vựng · bộ sưu tập/từ điển cá nhân (tab con).
Tôi       — tài khoản/sync (kèm trạng thái thật) · Premium · Giao diện/skin ·
            Yomitan · Quản trị (admin).
```

- Navigation: bottom tab bar 4 tab trên mobile (breakpoint 760px duy nhất,
  đồng bộ `MOBILE_MEDIA_QUERY`), sidebar thu gọn trên desktop.
- Routing bằng History API (không cần thư viện); mở overlay là push history
  để Back đóng overlay; mọi màn có URL.
- Phiên ôn là route toàn màn hình (không phải modal): progress bar mảnh,
  thẻ ~70dvh, tap lật, swipe 4 hướng sau khi lật (trái Quên · phải Nhớ ·
  lên Dễ · xuống Khó), phím Space + 1-4; màn tổng kết có breakdown + forecast
  + từ Quên "Ôn lại ngay".

## 5. Nguyên tắc cảm xúc (retention by design)

- Màn hình chính phải cho thấy cả **tài sản** (Đã thuộc N, thường trực) chứ
  không chỉ **nợ** (từ đang quên).
- Khoảnh khắc tốt nghiệp là điểm thưởng chính: dấu son 合格, animation một
  lần, không chỉ toast 4 giây.
- Kết phiên ôn là nơi đặt lời hẹn quay lại (forecast ngày mai, streak).
- `--seal` là màu của thành tựu — đừng tiêu nó vào việc khác.
