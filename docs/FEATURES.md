# Chức năng hệ thống — gioitu

> Tài liệu này liệt kê **chức năng** của ứng dụng từ góc nhìn người dùng: làm
> được gì, ở màn hình nào, tương tác ra sao. Mỗi mục dẫn tới nơi cài đặt trong
> mã và quy tắc nghiệp vụ tương ứng ([LOGIC.md](./LOGIC.md)).
>
> Kiến trúc: [ARCHITECTURE.md](./ARCHITECTURE.md). Lược đồ dữ liệu:
> [DB_SCHEMA.md](./DB_SCHEMA.md).

## 0. Bố cục màn hình chính

`src/app/App.tsx` lắp ráp một màn hình duy nhất: **Header → Search Bar → Filter
Bar → Word Cloud**, cộng các lớp phủ (overlay) mở theo nhu cầu: Detail Panel,
Review Session, Dictionary Manager, Theme Settings, Auth.

```
┌ Header ─────────────────────────────────────────────────────────┐
│ Gioitu   [Từ điển] [Quản lý từ điển] [Giao diện]  [Đồng bộ] email│
│                                                    [Đăng xuất]   │
│                                       (hoặc)  Khách [Đăng nhập]  │
├ Search Bar — chọn cặp ngôn ngữ + ô tra cứu + gợi ý live ─────────┤
├ Filter Bar — sắp xếp · nổi bật/chỉ-hiện từ cần ôn · [Ôn tập hôm nay]│
├ Word Cloud — bản đồ nhiệt các từ đang học ──────────┐            │
│                                          Detail Panel │ (khi mở) │
└──────────────────────────────────────────────────────┴──────────┘
        Toasts (góc) · Review/Manager/Theme/Auth là overlay
```

Header thay đổi theo trạng thái đăng nhập: đã đăng nhập hiện **Đồng bộ**, email
và **Đăng xuất**; chưa đăng nhập hiện **Khách** và **Đăng nhập**.

## 1. Tra cứu từ điển

Tính năng lõi: gõ một từ, nhận nghĩa giàu kiểu Yomitan.

| Chức năng | Mô tả | Nơi cài đặt |
|---|---|---|
| Chọn cặp ngôn ngữ | Dãy nút chuyển 6 cặp thuận (Nhật→Việt, Việt→Nhật, Nhật→Anh, Anh→Nhật, Anh→Việt, Việt→Anh); nút đang chọn `active` | `SearchBar.tsx`, `languages.ts` |
| Ô tra cứu | Placeholder `Tra từ (<cặp>)… Enter để xác nhận`; Enter để xác nhận | `SearchBar.tsx` |
| Gợi ý live | Vừa gõ vừa gợi ý (debounce ~120ms): từ + cách đọc + nghĩa đầu. **Không** tính lượt tra | `SearchBar.tsx`, `searchSuggest` |
| Chọn nguồn từ điển | Toggle *Trên máy* / *Server*; nguồn được chọn tra trực tiếp (không auto-fallback), lưu ở localStorage | `SearchBar.tsx`, `domain/source.ts`, `data/sources.ts` |
| Định tuyến tìm | `search.ts` chỉ `getSource(source)` rồi uỷ thác; 2 nguồn sau interface `DictionarySource` | `dictionary/data/search.ts`, `data/sources.ts` |
| Deinflection | Tự đưa từ biến cách về dạng từ điển; SRS theo dõi **lemma** | `domain/deinflect.ts`, [LOGIC §6](./LOGIC.md) |
| Tra mờ (fuzzy) | Gõ sai/nhớ lộn vẫn ra: near-miss theo khoảng cách Levenshtein (cả term lẫn reading), chạy nền và **bổ sung** sau kết quả khớp đúng (*Có phải bạn muốn tìm:*) | `domain/fuzzy.ts`, `fuzzyTerms`/`serverFuzzy`, `findFuzzyRouted` |

### Detail Panel — chi tiết một từ

`DetailPanel.tsx` + `StructuredContent.tsx` hiển thị:

- **Headword + furigana** (ruby), tên từ điển nguồn.
- **Chuỗi biến cách**: ví dụ `食べた → 食べる` với các chip lý do (quá khứ, lịch
  sự, bị động…) — chỉ hiện khi từ có biến cách.
- **Tag từ / tag từ loại**: chip mã (vd `n`, `v`) có tooltip tên đầy đủ, tô màu
  theo nhóm (`tagMeta` phân giải từ `tag_bank`).
- **Phát âm IPA**: nhóm theo từng từ điển, mỗi transcription có tag vùng (Hà Nội/
  Huế/Sài Gòn…) — chỉ hiện khi có dữ liệu term-meta.
- **Định nghĩa giàu (structured content)**: danh sách sense đánh số, mỗi sense có
  tag từ loại; render được list, nhấn mạnh, bảng (cuộn ngang), `<details>`, ảnh
  (xuống cấp thành `[alt]`).
- **Link nội bộ `?query=…`**: bấm là tra tiếp từ đó (đếm như một lượt tra).
- **Thống kê SRS** (khi từ đã có entry): số lần tra, trạng thái (Đang học / Đã
  thuộc / Tái quên), trạng thái thẻ, chu kỳ kế (`formatInterval`), thời điểm ôn
  tiếp (`formatRelative`), `EF / lapses`.

### Tự định nghĩa & thêm thủ công

- **Không tìm thấy** → ô "Tự định nghĩa từ này" + nút **Lưu định nghĩa**; lưu là
  một entry `is_custom`. (`DetailPanel.tsx` → `useLookup.onSaveCustom`)
- **Thêm thủ công `[+]` (`manualAdd`)**: khẳng định ý định học → tạo thẻ SRS
  **ngay**, bỏ qua cổng ≥ 2 lần tra. (`domain/lookup.ts`, [LOGIC §3](./LOGIC.md))

## 2. Word Cloud (bản đồ từ)

Trực quan hoá những từ **đang học** dưới dạng bản đồ nhiệt — màu càng đậm là tra
càng nhiều. (`review/ui/WordCloud.tsx`, `domain/wordcloud.ts`)

- **Hiển thị**: chỉ từ `LEARNING`/`RELAPSED` (từ `LEARNED` bị ẩn để nhường chỗ).
- **Màu (heatmap)**: log-normalized theo `lookup_count`, độc lập SRS; tô bằng
  `heatBackground`/`heatTextColor` nên bám theo bảng màu người dùng.
- **Huy hiệu "!"**: đánh dấu từ `RELAPSED` (tái quên), aria-label "Tái quên".
- **Nổi bật/đến hạn**: từ đến hạn ôn được làm nổi; còn lại bị làm mờ (khi bật).
- **Bấm một tag**: mở Detail Panel ở chế độ **xem lại** — **không** tính lượt tra
  (xem bản đồ của mình không nên bị phạt). (`useLookup.onSelectTag`)
- **Trạng thái rỗng**: "Chưa có từ nào trên bản đồ. Hãy tra một từ để bắt đầu."

### Filter Bar (`review/ui/FilterBar.tsx`)

| Điều khiển | Tác dụng |
|---|---|
| **Sắp xếp** | `recent` (mới tra nhất) hoặc `frequency` (tra nhiều nhất) |
| **Nổi bật từ cần ôn** | Làm nổi từ đến hạn, làm mờ phần còn lại |
| **Chỉ hiện từ cần ôn** | Chỉ giữ lại từ đến hạn |
| **Ôn tập hôm nay (N)** | Mở phiên ôn tập; vô hiệu khi `N = 0` |

## 3. Phiên ôn tập SRS

`review/ui/ReviewSession.tsx` — overlay lật thẻ, chấm điểm theo SM-2.
(quy tắc: [LOGIC §4](./LOGIC.md))

- **Tiến độ** `i / tổng`; thẻ tái quên có nhãn "! tái quên".
- **Lật thẻ**: mặt trước là từ; bấm để lật xem nghĩa.
- **Bốn nút tự chấm**: **Again / Hard / Good / Easy**, mỗi nút *xem trước* khoảng
  ôn kế tiếp (gọi thẳng `gradeCard` để tính). Chấm xong nhảy thẻ tiếp.
- **Hoàn thành**: "Hoàn thành! 🎉" + số thẻ đã ôn; có thể **Kết thúc phiên** bất
  cứ lúc nào.

Hàng đợi là `store.dueEntries` (`isDue`: `next_review ≤ now`). Khi một từ vượt
ngưỡng `matureThreshold` (21 ngày) nó `→ LEARNED` và rời bản đồ; nếu rớt ngưỡng
trở lại thì `→ RELAPSED`.

## 4. Quản lý từ điển

Hai cấp độ, phản ánh kiến trúc từ điển hai nguồn:

### 4.1 Từ điển cục bộ (IndexedDB — nguồn chính, dùng được cho guest)

Nút **Từ điển** trên header (`DictionaryImport.tsx`):

- **Nhập `.zip` Yomitan** cho cặp đang chọn → parse và nạp vào IndexedDB.
- **Nhập từ URL** `.zip` (CORS cho phép).
- **Liệt kê & xoá** từ điển cục bộ (registry `dictionaries`), kèm số từ / số phát
  âm đóng góp.
- Trạng thái nút hiện số từ của cặp hiện tại, hoặc "server" nếu chưa có cục bộ.

Đường nhập này giữ **đầy đủ** structured content, tag, rule, term-meta (IPA/pitch/
freq). (`dictionary/data/yomitan.ts`, [LOGIC §8](./LOGIC.md))

### 4.2 Từ điển server dùng chung (cần đăng nhập)

Nút **Quản lý từ điển** (`ui/DictionaryManager/`). Nếu chưa đăng nhập → lời mời
đăng nhập. Khi đã đăng nhập, có hai tab + chọn cặp ngôn ngữ:

**Tab "Nhập & danh sách"** (`ImportTab.tsx`):
- Nhập **nhiều** file `.zip` cùng lúc (xử lý tuần tự, có danh sách tiến độ từng
  file: chờ/xong/lỗi).
- Nhập từ **URL** (server tải về rồi import).
- Tuỳ chọn **Tự nhận ngôn ngữ** từ `index.json`, hoặc gán theo cặp đang chọn.
- **Danh sách từ điển đã nhập** (tên · cặp · số từ) với nút **Xóa** (có xác nhận).

**Tab "Tra cứu & sửa nghĩa"** (`EditTab.tsx`):
- **Thêm từ mới** (form thu gọn): từ + cách đọc + mỗi dòng một nghĩa.
- **Tìm theo tiền tố** + **phân trang** (Trước/Sau, tổng số từ).
- Mỗi từ: **Sửa** (cách đọc + các nghĩa, inline) / **Xóa** (có xác nhận).

> Term thêm/sửa tay có `dict_id = NULL` nên sống sót khi một từ điển import bị
> xoá. Đường server lưu **plain-text** (không structured content). (xem
> [DB_SCHEMA §4.2](./DB_SCHEMA.md))

## 5. Giao diện (Theme)

Nút **Giao diện** (`theme/ui/ThemeSettings.tsx`) — overlay tuỳ chỉnh màu, áp
**tức thì** toàn app và lưu `localStorage`. (toán màu: [LOGIC §13](./LOGIC.md))

- **Mẫu có sẵn (preset)**: Mặc định, Nhiệt, Đại dương, Rừng, Nho — mỗi mẫu có
  swatch gradient; bấm là áp ngay.
- **Bản đồ nhiệt**: chỉnh hai đầu gradient (`heatFrom` ít tra → `heatTo` tra
  nhiều), có dải xem trước 5 mức sắc độ.
- **Bảng màu** (6 ô có color-picker + nhập hex): Màu nhấn, Cảnh báo, Nền trang,
  Chữ, Chữ phụ, Đường kẻ.
- **Hoàn tác** (về lúc mở), **Mặc định** (reset preset), **Xong**.

## 6. Tài khoản & đồng bộ

App **dùng được đầy đủ không cần tài khoản** (chế độ Khách, `user_id =
"__guest__"`). Đăng nhập là tuỳ chọn, chỉ thêm đồng bộ đa thiết bị.
(`auth/ui/AuthScreen.tsx`, `auth/useAuth.ts`)

- **Đăng nhập / Đăng ký** (email + mật khẩu ≥ 6 ký tự) trong một modal có thể bỏ
  qua ("Tiếp tục với tư cách khách").
- **Di trú tiến trình guest**: lần đăng nhập đầu, mọi entry `__guest__` được
  chuyển sang tài khoản mới (last-write-wins từng term) → không mất gì đã học khi
  dùng thử. (`App.tsx` `migrateThen` → `reassignEntries`)
- **Đồng bộ** (nút **Đồng bộ**, và tự chạy khi mở app): hai chiều, last-write-wins
  theo `updated_at`; offline/guest thì cache cục bộ tự đứng. (`repository.syncUserData`,
  [LOGIC §12](./LOGIC.md))
- **Bảo mật**: `user_id` rút từ JWT phía server, client không giả mạo được. (xem
  [DB_SCHEMA §6](./DB_SCHEMA.md))

## 7. Thông báo (Toasts)

`shared/ui/Toasts.tsx` — thông báo tạm (tự ẩn ~4s), ba loại `info`/`warn`/
`success`. Một số thời điểm hiện toast (`review/state/store.ts`):

| Sự kiện | Loại | Nội dung |
|---|---|---|
| Tra lại một từ đã thuộc (relapse) | warn | `Bạn đã quên lại từ "<từ>"` |
| Từ vào hàng đợi ôn tập (đạt gating) | success | `"<từ>" đã vào hàng đợi ôn tập` |
| Từ tốt nghiệp → đã thuộc | success | `"<từ>" đã thuộc 🎉` |
| Đồng bộ xong | success | `Đã đồng bộ` |

Nhập/xoá từ điển cũng phát toast/thông báo trạng thái tương ứng (thành công kèm
số từ · số phát âm · cặp; lỗi kèm mô tả).

## 8. Offline-first

- Tra cứu, Word Cloud và ôn tập SRS đều chạy **hoàn toàn cục bộ** trên IndexedDB,
  kể cả khi không có mạng hoặc không có tài khoản.
- Mọi lời gọi mạng (sync, server dict) là **best-effort**: thất bại thì trả
  `null`/`[]` và cache cục bộ vẫn phục vụ.
- Cài như PWA tuỳ môi trường; lõi dữ liệu nằm trên máy nên mở lại là có ngay.

## 9. Bản đồ chức năng → tài liệu

| Nhóm chức năng | Quy tắc nghiệp vụ | Lưu trữ |
|---|---|---|
| Tra cứu, deinflection, import | [LOGIC §3,6,7,8,9,10,11](./LOGIC.md) | [DB_SCHEMA §2,4](./DB_SCHEMA.md) |
| Word Cloud, ôn tập SRS | [LOGIC §4,5](./LOGIC.md) | [DB_SCHEMA §2.5](./DB_SCHEMA.md) |
| Đồng bộ & tài khoản | [LOGIC §12](./LOGIC.md) | [DB_SCHEMA §5,6](./DB_SCHEMA.md) |
| Theme | [LOGIC §13](./LOGIC.md) | `localStorage` |
</content>
