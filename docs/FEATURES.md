# Chức năng hệ thống — gioitu

> Tài liệu này liệt kê **chức năng** của ứng dụng từ góc nhìn người dùng: làm
> được gì, ở màn hình nào, tương tác ra sao. Mỗi mục dẫn tới nơi cài đặt trong
> mã và quy tắc nghiệp vụ tương ứng ([LOGIC.md](./LOGIC.md)).
>
> Kiến trúc: [ARCHITECTURE.md](./ARCHITECTURE.md). Lược đồ dữ liệu:
> [DB_SCHEMA.md](./DB_SCHEMA.md).

## 0. Bố cục màn hình chính

`src/app/App.tsx` lắp ráp một màn hình chính + các **trang** chuyển bằng state
nội bộ (`page`: home / learned / kanji / vocabstudy — chưa có URL/route), cộng
các lớp phủ (overlay) mở theo nhu cầu: Detail Panel, Review Session,
Dictionary Manager, Custom Dictionary, Theme Settings, Yomitan Sync, Premium,
Contribution Review, Auth.

```
┌ Header ─────────────────────────────────────────────────────────┐
│ 語 Gioitu                [Từ điển ▾ (cặp + nguồn + import)]  [☰] │
├ Search Bar — ô tra cứu + gợi ý live + viết tay/bộ thủ ───────────┤
├ Filter Bar — sắp xếp · nổi bật/chỉ-hiện từ cần ôn · [Ôn tập hôm nay]│
├ Word Cloud — bản đồ nhiệt các từ đang học ──────────┐            │
│                                          Detail Panel │ (khi mở) │
└──────────────────────────────────────────────────────┴──────────┘
        Toasts (góc) · các màn còn lại là mục trong menu ☰
```

Menu **☰** chứa toàn bộ lối vào còn lại (thay đổi theo đăng nhập/quyền):
Đã thuộc · Thống kê kanji · Học từ vựng · Từ điển cá nhân · Giao diện ·
Kết nối Yomitan · Premium · Xuất/Nhập dữ liệu học · Đồng bộ · Đăng nhập/Đăng xuất;
admin thêm Quản lý từ điển · Duyệt đề xuất. (IA đích 4 khu: [DESIGN.md](./DESIGN.md).)
Với **khách**, các mục chỉ dùng được khi đăng nhập (**Kết nối Yomitan**,
**Premium**) hiện **ổ khoá** (icon SVG) kèm gợi ý "cần đăng nhập" — tường đăng
nhập nhất quán, không giấu hẳn cũng không mời-rồi-chặn. (`app/HeaderMenu.tsx`)

## 1. Tra cứu từ điển

Tính năng lõi: gõ một từ, nhận nghĩa giàu kiểu Yomitan.

| Chức năng | Mô tả | Nơi cài đặt |
|---|---|---|
| Chọn cặp ngôn ngữ | Dropdown ở nút "Từ điển" trên header, chuyển 6 cặp thuận (Nhật→Việt, Việt→Nhật, Nhật→Anh, Anh→Nhật, Anh→Việt, Việt→Anh); mục đang chọn `active` | `DictionaryImport.tsx`, `languages.ts` |
| Ô tra cứu | Placeholder `Tra từ (<cặp>)…`; nút 🔍 hoặc Enter để xác nhận, nút ✕ để xóa | `SearchBar.tsx` |
| Gợi ý live | Vừa gõ vừa gợi ý (debounce ~120ms): từ + cách đọc + nghĩa đầu. **Không** tính lượt tra | `SearchBar.tsx`, `searchSuggest` |
| Chọn nguồn từ điển | Toggle *Trên máy* / *Server* trong cùng dropdown ở nút "Từ điển"; nguồn được chọn tra trực tiếp (không auto-fallback), lưu ở localStorage | `DictionaryImport.tsx`, `domain/source.ts`, `data/sources.ts` |
| Định tuyến tìm | `search.ts` chỉ `getSource(source)` rồi uỷ thác; 2 nguồn sau interface `DictionarySource` | `dictionary/data/search.ts`, `data/sources.ts` |
| Deinflection | Tự đưa từ biến cách về dạng từ điển; SRS theo dõi **lemma** | `domain/deinflect.ts`, [LOGIC §6](./LOGIC.md) |
| Tra mờ (fuzzy) | Gõ sai/nhớ lộn vẫn ra: near-miss theo khoảng cách Levenshtein (cả term lẫn reading), chạy nền và **bổ sung** sau kết quả khớp đúng (*Có phải bạn muốn tìm:*) | `domain/fuzzy.ts`, `fuzzyTerms`/`serverFuzzy`, `findFuzzyRouted` |
| Tra theo nghĩa (#172) | Gõ một cụm ở ngôn ngữ **nghĩa** (vd "đồng cảm" khi đang ở cặp Nhật→Việt) vẫn ra từ có gloss chứa cụm đó, không chỉ khớp cách viết/âm đọc; chạy nền song song với fuzzy, bổ sung sau (*Khớp theo định nghĩa:*) | `definitionTerms`/`serverByDefinition`, `findByDefinitionRouted`, `lookupByDefinition` (server) |

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
- **Link nội bộ `?query=…`**: bấm là tra tiếp từ đó (**không** tính lượt tra —
  tra thường không được ghi nhận, xem [LOGIC §3](./LOGIC.md)).
- **Thống kê SRS** (khi từ đã có entry): số lần tra, trạng thái (Đang học / Đã
  thuộc / Tái quên), trạng thái thẻ, chu kỳ kế (`formatInterval`), thời điểm ôn
  tiếp (`formatRelative`), `EF / lapses`.

### Bình luận / góp ý cho từ (#23)

- Cuối panel chi tiết: khu **Bình luận / góp ý** gắn theo từ (khoá
  `term_lang · native_lang · term · reading` — không gộp đồng âm).
- **Công khai**: guest đọc được; **đăng nhập mới viết** (guest thấy nút "Đăng
  nhập để bình luận"). Tác giả xoá bình luận của mình; **admin xoá bất kỳ**.
- Post-moderation: bình luận hiện ngay (cột `status` để admin ẩn về sau).
- Client `features/wordcomments/` (`domain/` thuần + test, `data/` gọi
  `/api/comments`, `ui/WordComments.tsx`); server `features/comments/` +
  migration `0011_dict_comments`.

### Tự định nghĩa & thêm thủ công

- **Không tìm thấy** → ô "Tự định nghĩa từ này" + nút **Lưu định nghĩa**; lưu là
  một entry `is_custom` (có ghi nhận lượt). (`DetailPanel.tsx` → `useLookup.onSaveCustom`)
- **Lỗi mạng ≠ không tìm thấy**: khi tra nguồn *Server* mà mất mạng / máy chủ
  lỗi, không báo "Không tìm thấy" nữa mà hiện thông điệp lỗi riêng + gợi ý chuyển
  nguồn sang *Trên máy* (offline). Một lượt tra trả `LookupResult` mang cờ lỗi
  thay vì nuốt lỗi thành `[]`. (`domain/lookupError.ts`, `data/serverDict.ts`,
  `data/sources.ts`, `DetailPanel.tsx`)
- **Nút `＋` (`manualAdd`)**: là **cách duy nhất** đưa một kết quả tra vào Word
  Cloud/SRS — tạo entry kèm thẻ SRS **ngay lượt đầu** (không còn cổng ≥ 2 lần
  tra; tra thường không được ghi nhận). (`domain/lookup.ts`, [LOGIC §3](./LOGIC.md))

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

- **Tiến độ** `còn N · đã ôn M`; thẻ tái quên có nhãn "! tái quên".
- **Thẻ khó nhằn (leech)**: thẻ rớt ≥ `leechLapseThreshold` (=8) lần hiện huy hiệu
  "Khó nhằn" + gợi ý (sửa nghĩa cho dễ nhớ hoặc tạm gác để học riêng). Chỉ
  **cảnh báo**, không tự hoãn/xoá. (`srs.isLeech`, [LOGIC §4.6](./LOGIC.md))
- **Lật thẻ**: mặt trước là từ; bấm để lật xem nghĩa.
- **Bốn nút tự chấm**: **Again / Hard / Good / Easy**, mỗi nút *xem trước* khoảng
  ôn kế tiếp (gọi thẳng `gradeCard` để tính). Chấm xong nhảy thẻ tiếp.
- **Ưu tiên quá hạn lâu**: trong phiên, thẻ quá hạn lâu nhất được phục vụ trước.
- **Chia lô ~20 thẻ**: phiên phục vụ từng lô `REVIEW_BATCH_SIZE` (=20) thẻ; hết
  lô mà còn thẻ đến hạn thì hiện lời mời **"Ôn tiếp N thẻ nữa"** (điểm dừng tự
  nhiên). Hàng đợi ≤ 20 thì không có bước hỏi này.
- **Hoàn thành**: "Hoàn thành! 🎉" + số thẻ đã ôn; có thể **Kết thúc phiên** bất
  cứ lúc nào.

Hàng đợi là `store.dueEntries` (`isDue`: `next_review ≤ now`); phiên **chụp một
lần** lúc mở rồi tự xếp thứ tự + chia lô (`review/domain/session.ts`,
[LOGIC §4.8](./LOGIC.md)). Khi một từ vượt ngưỡng `matureThreshold` (21 ngày) nó
`→ LEARNED` và rời bản đồ; nếu rớt ngưỡng trở lại thì `→ RELAPSED`.

Mỗi lượt chấm ghi một dòng **nhật ký ôn tập** (`review_log`, append-only) làm nền
cho thống kê retention/forecast + FSRS về sau — cục bộ, chưa có UI, chưa đồng bộ
cloud. Chi tiết: [LOGIC §4.7](./LOGIC.md), [DB_SCHEMA §2.6](./DB_SCHEMA.md).

## 4. Quản lý từ điển

Hai cấp độ, phản ánh kiến trúc từ điển hai nguồn:

### 4.1 Từ điển cục bộ (IndexedDB — nguồn chính, dùng được cho guest)

Nút **Từ điển** trên header (`DictionaryImport.tsx`), nhãn hiện cặp ngôn ngữ +
nguồn đang chọn (vd. "Nhật → Việt · Server"). Mở dropdown gồm:

- **Chọn cặp ngôn ngữ** và **chọn nguồn** (*Trên máy* / *Server*) — phạm vi tra
  cứu dùng chung cho `SearchBar`.
- **Nhập `.zip` Yomitan** cho cặp đang chọn → parse và nạp vào IndexedDB.
- **Nhập từ URL** `.zip` (CORS cho phép).
- **Liệt kê & xoá** từ điển cục bộ (registry `dictionaries`), kèm số từ / số phát
  âm đóng góp.

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

- **Đăng nhập bằng Google** (Google-only, không có email + mật khẩu) trong một
  modal có thể bỏ qua ("Tiếp tục với tư cách khách"). (`AuthScreen.tsx`,
  `GoogleSignInButton.tsx`)
- **Di trú tiến trình guest**: lần đăng nhập đầu, mọi entry `__guest__` được
  chuyển sang tài khoản mới (last-write-wins từng term) → không mất gì đã học khi
  dùng thử. Nếu trên máy đang có dữ liệu khách thì **hỏi xác nhận trước khi gộp**
  (máy dùng chung dễ trộn dữ liệu người khác — bấm Huỷ để giữ nguyên).
  (`App.tsx` `migrateGuestData` → `guestAdoptionPrompt` → `reassignEntries`)
- **Đồng bộ** (nút **Đồng bộ**, tự chạy khi mở app, và **tự động theo sự kiện**):
  hai chiều, last-write-wins theo `updated_at`; offline/guest thì cache cục bộ tự
  đứng. Với người đăng nhập, mọi thay đổi dữ liệu học (tra, chấm thẻ, đánh dấu
  thuộc/quên, xoá) được gộp lại rồi đẩy lên sau ~2,5s ngừng thao tác; rời tab hoặc
  đóng trang thì đẩy ngay — không cần bấm nút. (`repository.syncUserData`,
  `review/domain/syncScheduler.ts`, [LOGIC §12](./LOGIC.md))
- **Phản hồi trung thực**: `syncUserData` trả `{ entries, status, pulled, pushed }`
  với `status` = `ok` / `offline` / `unauthorized` (`review/domain/syncStatus.ts`
  `classifyResponse`; `syncApi` phân biệt 401 vs lỗi mạng vs OK, không nuốt thành
  `null`). Nút Đồng bộ báo đúng kết cục: thành công thật mới "Đã đồng bộ", offline
  thì cảnh báo "Chưa kết nối được máy chủ · dữ liệu đã lưu trên máy".
- **Phiên hết hạn** (JWT sống 30 ngày): gặp **401** khi đồng bộ — kể cả từ luồng
  ngầm — thì đăng xuất (bỏ token đã vô hiệu), toast báo, và mở màn đăng nhập kèm
  banner "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại". (`store.applySyncReport`
  → `App.handleSessionExpired`; `AuthScreen` prop `notice`)
- **"Đồng bộ lần cuối hh:mm"**: mốc đồng bộ thành công gần nhất lưu theo user_id
  (`review/data/lastSync.ts`, localStorage `gioitu.lastSync.v1:<uid>`), hiện gọn
  ngay trên nhãn mục "Đồng bộ" trong menu (`syncStatus.formatLastSync`).
- **Bảo mật**: `user_id` rút từ JWT phía server, client không giả mạo được. (xem
  [DB_SCHEMA §6](./DB_SCHEMA.md))

### An toàn dữ liệu cho khách (không đăng nhập)

Với khách, IndexedDB `user_data` là **bản duy nhất** của dữ liệu học (chưa có
cloud). Ba lớp bảo vệ giảm rủi ro mất trắng:

- **Lưu trữ bền**: khi có từ đầu tiên, app gọi `navigator.storage.persist()` xin
  trình duyệt đừng tự thu hồi IndexedDB khi thiếu dung lượng. Feature-detect, một
  lần mỗi phiên, thất bại/không hỗ trợ thì lặng lẽ bỏ qua. (`shared/persist.ts`,
  gọi từ `review/state/store.ts`)
- **Lời nhắc sao lưu**: khi khách tích luỹ ≥ `GUEST_BACKUP_REMINDER_THRESHOLD`
  (20) từ mà chưa đăng nhập, một banner nhẹ ngay trên ô tìm kiếm mời đăng nhập
  hoặc xuất sao lưu; tắt được (nhớ qua localStorage). (`review/ui/GuestBackupBanner.tsx`,
  `review/domain/backup.ts` `shouldRemindGuestBackup`)
- **Xuất / nhập sao lưu JSON** (menu **Xuất/Nhập dữ liệu học**, mọi người dùng):
  xuất toàn bộ `user_data` của người dùng hiện tại ra file `gioitu-backup-YYYY-MM-DD.json`;
  nhập lại trộn last-write-wins theo `updated_at` (dùng lại `mergeByUpdatedAt`) và
  gán entry về người đang dùng nên backup từ tài khoản/phiên khác vẫn hiện ra.
  Serialize/parse/validate thuần ở `review/domain/backup.ts`; đọc/ghi file +
  IndexedDB ở `review/data/backup.ts`.

## 7. Thông báo (Toasts)

`shared/ui/Toasts.tsx` — thông báo tạm (tự ẩn ~4s), ba loại `info`/`warn`/
`success`. Một số thời điểm hiện toast (`review/state/store.ts`):

| Sự kiện | Loại | Nội dung |
|---|---|---|
| Tra lại một từ đã thuộc (relapse) | warn | `Bạn đã quên lại từ "<từ>"` |
| Từ vào hàng đợi ôn tập (khi bấm `＋`) | success | `"<từ>" đã vào hàng đợi ôn tập` |
| Từ tốt nghiệp → đã thuộc | success | `"<từ>" đã thuộc 🎉` |
| Đồng bộ thành công | success | `Đã đồng bộ` (kèm số từ điển nếu Premium) |
| Đồng bộ khi offline | warn | `Chưa kết nối được máy chủ · dữ liệu đã lưu trên máy` |
| Phiên hết hạn (401) | warn | `Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại` |

Nhập/xoá từ điển cũng phát toast/thông báo trạng thái tương ứng (thành công kèm
số từ · số phát âm · cặp; lỗi kèm mô tả).

## 8. Offline-first

- Tra cứu, Word Cloud và ôn tập SRS đều chạy **hoàn toàn cục bộ** trên IndexedDB,
  kể cả khi không có mạng hoặc không có tài khoản.
- Mọi lời gọi mạng là **best-effort**, cache cục bộ luôn phục vụ khi lỗi — nhưng
  **không nuốt lỗi im lặng**: tra server phân biệt lỗi mạng vs không tìm thấy
  (`lookupError`); đồng bộ dữ liệu học phân biệt offline vs 401 và báo lên UI
  (`syncStatus`).
- Cài như PWA tuỳ môi trường; lõi dữ liệu nằm trên máy nên mở lại là có ngay.

## 9. Các tính năng bổ sung (2026)

> Các màn/tính năng mọc sau bản SPEC gốc. Bảng dưới là mục lục nhanh (lối vào ·
> mục đích · nơi cài đặt); chi tiết UX ở các mục §9.1–§9.11 kế tiếp. Khi thêm
> tính năng mới, cập nhật cả bảng lẫn một mục chi tiết ở đây (cổng review mỗi PR
> tính năng — xem CLAUDE.md).

| Tính năng | Lối vào | Mô tả ngắn | Chi tiết |
|---|---|---|---|
| Đã thuộc | ☰ (chỉ hiện khi N>0) | Trang trưng từ đã LEARNED, nhóm theo thời gian | [§9.1](#91-đã-thuộc-learnedcloud) |
| Thống kê kanji | ☰ | Lưới độ phủ kanji theo nhóm + "Đánh dấu nhanh" | [§9.2](#92-thống-kê-kanji) |
| Học từ vựng | ☰ | Lưới ô từ (3 nguồn) để đánh dấu biết/không biết | [§9.3](#93-học-từ-vựng) |
| Từ điển cá nhân | ☰ | Soạn từ điển riêng trong IndexedDB (nhập tay + AI) | [§9.4](#94-từ-điển-cá-nhân) |
| Study list | (chưa nối vào UI) | Bộ từ lưu server; client mới chỉ đọc qua Học từ vựng | [§9.5](#95-study-list) |
| Chia sẻ từ điển | Nút "Chia sẻ" ở mỗi từ điển trên máy | Link tải .zip sống ~5 phút để chuyển máy | [§9.6](#96-chia-sẻ-từ-điển) |
| Premium | ☰ | Kích hoạt bằng mã; mở khoá sync từ điển cá nhân | [§9.7](#97-premium) |
| Đóng góp & duyệt | Panel chi tiết (user) · ☰ Duyệt đề xuất (admin) | Đề xuất sửa nghĩa từ điển server, admin duyệt | [§9.8](#98-đóng-góp--duyệt) |
| Bình luận / góp ý | Cuối panel chi tiết một từ | Bình luận công khai theo từ (xem §1) | [§1](#bình-luận--góp-ý-cho-từ-23) |
| Kết nối Yomitan | ☰ (cần đăng nhập) | Cấu hình để Yomitan đẩy từ đã lưu về server này | [§9.9](#99-kết-nối-yomitan) |
| Viết tay & bộ thủ | Nút ✏️/部 cạnh ô tra (chỉ khi tra tiếng Nhật) | Vẽ kanji + lọc bộ thủ + panel gợi ý khớp | [§9.10](#910-viết-tay--bộ-thủ) |
| Skin nền anime | Giao diện | 4 backdrop trang trí lazy-load, tôn trọng reduced-motion | [§9.11](#911-skin-nền-anime) |

### 9.1 Đã thuộc (LearnedCloud)

Trang trưng "tài sản" đã học. Mục menu **Đã thuộc (N)** chỉ hiện khi `N > 0`
(`store.learnedEntries.length`) — đây là điểm BACKLOG muốn đổi thành thường trực.
(`App.tsx:290-292 · review/ui/LearnedCloud.tsx`)

- **Nội dung**: các entry `status === "LEARNED"`, cùng kiểu heatmap như Word Cloud
  chính (sắc độ log-normalized theo `lookup_count`, `computeShade`); tooltip
  "Tra N lần", bấm mở Detail Panel ở chế độ xem lại (**không** tính lượt tra).
- **Sắp xếp**: `store.learnedEntries` sắp theo `updated_at` giảm dần (mới thuộc
  lên trước); `LearnedCloud` không sắp lại.
- **Nhóm theo thời gian**: dùng `CloudViewControls` chung với cloud chính (ngày /
  tháng / năm / không nhóm). Khi có nhóm, `groupByPeriod` gom theo
  **`last_lookup_at`** — *không* phải thời điểm thuộc; đây là điểm "kể sai câu
  chuyện" mà BACKLOG (trường `learned_at`) muốn sửa.
- **Lọc ngôn ngữ** theo cặp đang xem (`filterByLang`).
- **Rỗng**: "Chưa có từ nào đã thuộc. Hãy ôn tập để chinh phục!" (thực tế menu đã
  ẩn khi N=0 nên chủ yếu để phòng render trực tiếp).

### 9.2 Thống kê kanji

Lưới độ phủ kanji kiểu add-on "Kanji Grid" của Anki. Mục menu **Thống kê kanji**
luôn hiện. (`features/kanjistats/`, `App.tsx:293,399-406`)

- **Nguồn từ** (dropdown): *Đã thuộc* (entry `LEARNED`, mặc định) hoặc *Tất cả từ
  đang học* (entry có `card_state`). Đây là tập từ dùng để bóc kanji.
- **Nhóm theo**: JLPT (mặc định), cấp lớp (grade), RTK, WaniKani, hoặc *Không
  nhóm*. Bộ nhóm là JSON port nguyên từ add-on Kuuuube. (`data/groupings.ts`)
- **Tính điểm mỗi kanji** (`domain/kanjigrid.ts`): gom `srs_interval` (phút) của
  mọi từ chứa kanji đó thành trung bình, rồi `score = 1 - 1/(ratio+1)²` với
  `ratio = avgInterval / (matureThreshold ngày)`. Từ chưa có chu kỳ vẫn tính là
  đã gặp nhưng kéo điểm xuống. Ô tô bằng `heatBackground`/`heatTextColor` (theo
  bảng màu người dùng); legend Yếu→Mạnh.
- **Chế độ xem**: *Không nhóm* liệt kê kanji đã biết mạnh-trước; *có nhóm* hiện
  tổng "Đã biết X/Y kanji trong nhóm (P%)" + mỗi nhóm có thanh tiến độ và, tuỳ
  chọn "Hiện kanji chưa biết", các ô `missing` viền đứt ở sắc độ 0.
- **Đánh dấu nhanh** (checkbox): bật thì bấm một ô = ghi nhận kanji đó **đã biết**
  (`markKnownByTerm(kanji, "ja", "vi")` → tạo/tốt-nghiệp một entry `LEARNED` cho
  đúng một ký tự kanji), thay vì mở tra cứu; ô có affordance `.quick`.

### 9.3 Học từ vựng

Lưới ô từ (kiểu kanji-grid) để duyệt nhanh và tự đánh dấu biết/không biết. Mục
menu **Học từ vựng** luôn hiện. (`features/vocabstudy/`, `App.tsx:294,407-421`)

- **Ba nguồn** (dropdown "Nguồn danh sách"):
  - *Lịch sử* (mặc định): chính `store.entries`, lọc theo cặp ngôn ngữ đang chọn.
  - *Từ điển cá nhân*: nạp toàn bộ một từ điển tự soạn từ IndexedDB (không phân
    trang — từ điển cá nhân thường nhỏ).
  - *Study list*: bộ từ trên server, **cần đăng nhập** (chưa đăng nhập thì hiện
    lời mời).
- **Phủ tiến độ** (`domain/vocablist.ts`): `applyProgress` chồng entry SRS lên
  danh sách nguồn theo khoá `(term, term_lang)`, phân loại 4 trạng thái —
  `learned` / `due` (đến hạn) / `learning` / `missing` — và tô sắc độ tương ứng
  (learned đậm nhất, missing viền đứt). Ô đã thuộc có dấu ✓.
- **Tóm tắt + lọc**: dòng "Đã thuộc N/T (P%) · đang học · cần ôn · chưa học" và
  thanh tiến độ; dropdown "Lọc theo" (tất cả / chưa học / đang học / đến hạn / đã
  thuộc).
- **Tương tác (mã hiện tại)**: *click đơn* (trễ 250ms) xem nghĩa; *click đúp*
  toggle nhớ↔quên (`markForgottenEntry` nếu đang LEARNED, ngược lại
  `markKnownByTerm`). Đây là hành vi BACKLOG muốn thay bằng "Đánh dấu nhanh" như
  Thống kê kanji (double-click kém ổn định trên cảm ứng).
- **Rỗng**: thông điệp khác nhau theo nguồn / khi bộ lọc không khớp.

### 9.4 Từ điển cá nhân

Soạn từ điển riêng, lưu **cục bộ trong IndexedDB** nên guest dùng được, offline
được (chỉ *đồng bộ* mới cần Premium). Mục menu **Từ điển cá nhân** mở một modal.
(`dictionary/ui/CustomDictionary/`, `data/customDict.ts`, `App.tsx:295,469-485`)

- **Bản chất lưu trữ**: một từ điển cá nhân là một bản ghi registry
  `LocalDictionary` (`custom: true`) cộng các `DictEntry` gắn `dictId`, nên nó
  xuất hiện luôn dưới nguồn tra *Trên máy* mà không đổi schema.
- **Cấu hình (DictConfig)**: chọn cặp ngôn ngữ + tạo từ điển mới (tên bắt buộc,
  mô tả/chủ đề tuỳ chọn) **hoặc** chọn một từ điển sẵn có để nối thêm. Chọn từ
  điển sẵn có sẽ khoá cặp ngôn ngữ; chọn một từ điển *custom* thì nạp toàn bộ từ
  vào lưới để sửa tại chỗ ("edit mode").
- **Nhập tay (ManualGrid)**: lưới kiểu bảng tính, cột từ · cách đọc · từ loại ·
  nghĩa · ví dụ · giải thích · từ liên quan. Enter chèn hàng mới; nhiều nghĩa
  ngăn bằng `;`, ví dụ dạng `câu :: bản dịch`. Ô ngôn ngữ nguồn có `lang="ja"`
  khi cặp là Nhật.
- **Tạo bằng AI (AiPanel)** — hai đường:
  - **"Lấy Prompt"**: dựng prompt và chép vào clipboard để tự chạy ChatGPT/Gemini
    rồi dán JSON trả về vào ô "Phân tích & thêm vào lưới" — không cần server.
  - **"Generate"**: gửi prompt tới server (proxy Deepseek, `POST
    /api/ai/generate-vocab`), **cần đăng nhập** (nút bị vô hiệu khi chưa đăng
    nhập). Kết quả parse xong được thêm lên đầu lưới để soát.
- **Lưu**: chế độ *add* có dedupe theo `(term, reading)` và `ConflictDialog` (ghi
  đè tất cả / bỏ qua từ trùng); chế độ *edit* ghi cho khớp lưới (xoá từ đã gỡ,
  cập nhật phần còn lại).
- **Xuất `.zip` Yomitan**: **không** nằm ở đây mà ở nút **Tải ZIP** của mỗi từ
  điển trong panel "Từ điển" trên header (`DictionaryImport.tsx`, `exportDictAsZip`).
- **Đồng bộ (Premium)**: hai chiều nguyên từ điển, LWW theo `updatedAt`, chạy
  ngầm — nhưng chỉ khi `email && isPremium`. Từ điển *custom* luôn được đồng bộ;
  từ điển *đã nhập* chỉ đồng bộ khi ≤ `SYNCABLE_MAX_TERMS` (2000). Người đăng
  nhập chưa Premium bấm "Đồng bộ" sẽ thấy "Cần Premium để đồng bộ từ điển".
  (`data/customDictSync.ts`, `App.tsx:146-182`)

### 9.5 Study list

Khái niệm "bộ từ tự gom" lưu **trên server** (song song với Từ điển cá nhân
IndexedDB — xem quyết định mở #3 trong BACKLOG). (`features/studylist/`)

- **Trạng thái hiện tại — nửa vời**: `AddToListButton` (nút "＋ Danh sách" trên
  kết quả tra, `return null` cho khách) **chưa được nối vào UI nào** — không
  component nào render nó. Vì vậy client hiện **không có** lối tạo / thêm / đổi
  tên / xoá study list sống.
- **Cái đang chạy**: chỉ đường **đọc** — `listMine` + `getList` được
  `vocabstudy` tái dùng để hiện study list dưới dạng lưới học có phủ SRS (§9.3).
- **API client** (`data/studyListApi.ts`) vẫn có đủ `createList` / `addWord` /
  `renameList` / `deleteList` / `removeWord` / `markedFor`, tất cả **cần đăng
  nhập** (`authHeaders` ném lỗi khi thiếu token); server cài đặt đủ ở
  `server/src/features/studylist/`. Khi nối lại UI thì bám mẫu tường đăng nhập
  (nhãn 🔒 ở menu — BACKLOG).

### 9.6 Chia sẻ từ điển

Chuyển một từ điển sang máy khác qua link tải `.zip` ngắn hạn. Lối vào: nút
**Chia sẻ** ("Tạo link chia sẻ tạm (5 phút)") ở mỗi từ điển trên máy trong panel
"Từ điển" của header. (`features/share/`, `DictionaryImport.tsx:195,205-215`)

- **Cần đăng nhập**: chưa đăng nhập thì `ShareDialog` chỉ hiện "Cần đăng nhập để
  tạo link chia sẻ tạm" + nút Đăng nhập, không đóng gói gì.
- **Luồng**: đóng gói từ điển thành `.zip` Yomitan (`exportDictAsZip`) → upload
  (`createShareLink` → `POST /api/share`, base64 theo khối 0x8000 byte cho an
  toàn stack) → trả URL `…/api/dl/:id`.
- **Hết hạn**: đồng hồ đếm ngược MM:SS tới `expiresAt` (server trả), UI nêu "tự
  hết hạn sau 5 phút"; hết giờ thì hiện "Link đã hết hạn." và khoá nút chép.

### 9.7 Premium

Gói trả phí mở khoá **đồng bộ từ điển cá nhân đa thiết bị**; đồng bộ tiến trình
học (SRS) vẫn **miễn phí**. Mục menu **Premium** (hiện "Premium ✓" khi đã kích
hoạt). (`features/premium/`, `App.tsx:298,508`)

- **Kích hoạt (user)**: cần đăng nhập (Premium gắn theo tài khoản). Nhập mã dạng
  `ABCD-EFGH-JKMN` → `redeemPremiumCode` (`POST /api/premium/redeem`); thành công
  thì cập nhật cache phiên (`markSessionPremium`) để UI/cổng đồng bộ phản ánh
  ngay, hiện "✓ Tài khoản đã kích hoạt Premium." Lỗi server hiện inline. Chưa
  đăng nhập thì thay ô nhập mã bằng lời mời đăng nhập.
- **Admin sinh mã**: chỉ hiện khi `isAdmin`. Liệt kê mã (mới nhất trước,
  `GET /api/premium/codes`); nút "Tạo 5 mã mới" (`POST …`, `count: 5`). Mỗi mã
  hiện trạng thái đã dùng / chưa dùng theo `redeemed_by`.

### 9.8 Đóng góp & duyệt

Cộng đồng đề xuất sửa nghĩa cho **từ điển server dùng chung**, admin duyệt.
(`features/contribute/`)

- **Đề xuất (user)**: từ panel chi tiết một từ (`onPropose`). `proposeResult` dựng
  `gloss` (từ `senses`, hoặc `definitions`) + `pos` (tag từ loại đã dedupe) rồi
  `proposeWord` (`POST /api/contribute`). Toast "Đã gửi đề xuất, chờ admin duyệt".
  (`App.tsx:229-238,275`)
- **Duyệt (admin)**: mục menu **Duyệt đề xuất** (chỉ admin) mở `ContributionReview`
  — liệt kê đề xuất đang chờ (`GET /api/contribute/pending`), mỗi mục hiện
  từ + cách đọc, cặp ngôn ngữ, từ loại và các nghĩa. Hai nút **Duyệt**
  (`…/approve`) / **Từ chối** (`…/reject`); duyệt xong gỡ khỏi danh sách, nút khoá
  trong lúc gọi, lỗi hiện inline. Rỗng: "Không có đề xuất nào đang chờ."

### 9.9 Kết nối Yomitan

Cấu hình để tiện ích Yomitan trên trình duyệt **đẩy từ đã lưu về server này** (qua
kênh tích hợp Anki), chứ không xuất file. Mục menu **Kết nối Yomitan**.
(`auth/ui/YomitanSync.tsx`, `App.tsx:297,495`)

- **Cần đăng nhập**: từ lưu phải gắn với một tài khoản; guest thấy lời mời đăng
  nhập thay vì phần cài đặt.
- **Hai giá trị chép được**: *Server endpoint* `${origin}/api/yomitan-sync` (dựng
  theo origin hiện tại nên đúng cả localhost lẫn khi deploy) và *API key* ổn định
  theo user (`getYomitanKey`); "Tạo khóa mới" (`regenerateYomitanKey`) có xác
  nhận vì khoá cũ sẽ ngừng hoạt động.
- **Hướng dẫn**: bật tích hợp Anki trong Yomitan, dán Server + API key, chọn Deck
  và Type/Model = "Website Database", map trường Word/Reading/Glossary/Sentence.
  Bấm "+" trong Yomitan là từ được lưu vào gioitu.

### 9.10 Viết tay & bộ thủ

Hai công cụ nhập kanji kiểu jisho, bật bằng nút ✏️ (Viết tay) và 部 (Bộ thủ) ở đầu
ô tìm — **chỉ hiện khi đang tra tiếng Nhật** (`pair.source === "ja"`). Khi một
công cụ mở, dropdown gợi ý dưới ô tìm nhường chỗ cho panel công cụ.
(`dictionary/ui/HandwritingPad.tsx`, `RadicalPicker.tsx`, `InstantActions.tsx`,
`SearchBar.tsx:164-186`)

- **Viết tay — cần mạng (server)**: canvas Pointer Events (chuột + cảm ứng), nét
  chuẩn hoá về [0,1]. Nhấc bút → debounce 500ms → `recognizeHandwriting`
  (`POST /api/handwriting`) trả tối đa 5 ứng viên; bấm ứng viên chèn ký tự vào ô
  tìm. Mất mạng / server lỗi thì báo **"Không nhận dạng được — kiểm tra kết nối
  mạng."** thay vì trống trơn (epoch guard bỏ phản hồi cũ).
- **Bộ thủ — client, offline**: nạp dữ liệu radkfile lazy (`loadRadicalData`),
  lọc hoàn toàn phía client nên tức thì và offline được. Chọn nhiều bộ → hiện
  kanji chứa **đủ** các bộ đã chọn và làm mờ bộ không còn ghép được; nút reset
  xoá lựa chọn; bấm kanji chèn vào ô tìm.
- **InstantActions**: panel bên phải panel công cụ (chỉ desktop) chạy
  `searchSuggest` liên tục trên chuỗi hiện tại (kể cả ký tự vừa chèn), tối đa 8
  mục; bấm một mục là tra ngay. Giữ panel mounted để không giật layout ("Đang
  tìm…" / "Chưa có gợi ý").

### 9.11 Skin nền anime

Bộ backdrop trang trí lazy-load, chỉ đổi hoạ tiết nền (không đụng token chữ/nền).
Lối vào: **Giao diện** → mục "Mẫu có sẵn" + công tắc "Hiện hoạ tiết nền của
theme". (`theme/presets/`, `theme/ui/ThemeBackdrop.tsx`, `ThemeSettings.tsx`)

- **Bốn skin** (`presets/registry.ts`, khoá `BackgroundEffect`): `buu` (Majin
  Buu), `cell`, `bamboo` (Rừng trúc — thư mục `panda/`), `akatsuki`.
- **Lazy-load**: mỗi hiệu ứng là một `lazy(() => import(...))` riêng, render trong
  `<Suspense fallback={null}>` ở lớp `.theme-backdrop` (fixed, `z-index: -1`,
  `pointer-events: none`) — skin không chọn thì không tải component/CSS/ảnh. Không
  render khi tắt hiệu ứng (`effectsEnabled`).
- **Reduced-motion**: mỗi background đặt `data-speed` + biến `--fx-drift`; CSS
  đóng băng animation khi OS bật "giảm chuyển động" hoặc khi `data-speed="none"`
  (`styles.css:483-486`) — hoạ tiết vẫn hiện nhưng đứng yên.

## 10. Bản đồ chức năng → tài liệu

| Nhóm chức năng | Quy tắc nghiệp vụ | Lưu trữ |
|---|---|---|
| Tra cứu, deinflection, import | [LOGIC §3,6,7,8,9,10,11](./LOGIC.md) | [DB_SCHEMA §2,4](./DB_SCHEMA.md) |
| Word Cloud, ôn tập SRS | [LOGIC §4,5](./LOGIC.md) | [DB_SCHEMA §2.5](./DB_SCHEMA.md) |
| Đồng bộ & tài khoản | [LOGIC §12](./LOGIC.md) | [DB_SCHEMA §5,6](./DB_SCHEMA.md) |
| Theme | [LOGIC §13](./LOGIC.md) | `localStorage` |
</content>
