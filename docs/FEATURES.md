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
Kết nối Yomitan · Premium · Đồng bộ · Đăng nhập/Đăng xuất; admin thêm
Quản lý từ điển · Duyệt đề xuất. (IA đích 4 khu: [DESIGN.md](./DESIGN.md).)

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
  dùng thử. (`App.tsx` `migrateThen` → `reassignEntries`)
- **Đồng bộ** (nút **Đồng bộ**, tự chạy khi mở app, và **tự động theo sự kiện**):
  hai chiều, last-write-wins theo `updated_at`; offline/guest thì cache cục bộ tự
  đứng. Với người đăng nhập, mọi thay đổi dữ liệu học (tra, chấm thẻ, đánh dấu
  thuộc/quên, xoá) được gộp lại rồi đẩy lên sau ~2,5s ngừng thao tác; rời tab hoặc
  đóng trang thì đẩy ngay — không cần bấm nút. (`repository.syncUserData`,
  `review/domain/syncScheduler.ts`, [LOGIC §12](./LOGIC.md))
- **Bảo mật**: `user_id` rút từ JWT phía server, client không giả mạo được. (xem
  [DB_SCHEMA §6](./DB_SCHEMA.md))

## 7. Thông báo (Toasts)

`shared/ui/Toasts.tsx` — thông báo tạm (tự ẩn ~4s), ba loại `info`/`warn`/
`success`. Một số thời điểm hiện toast (`review/state/store.ts`):

| Sự kiện | Loại | Nội dung |
|---|---|---|
| Tra lại một từ đã thuộc (relapse) | warn | `Bạn đã quên lại từ "<từ>"` |
| Từ vào hàng đợi ôn tập (khi bấm `＋`) | success | `"<từ>" đã vào hàng đợi ôn tập` |
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

## 9. Các tính năng bổ sung (2026) — kiểm kê

> Các màn/tính năng mọc sau bản SPEC gốc. Mỗi dòng: lối vào · mục đích · nơi
> cài đặt. Chi tiết UX chưa được viết đầy đủ (nợ tài liệu — xem BACKLOG).

| Tính năng | Lối vào | Mô tả ngắn | Nơi cài đặt |
|---|---|---|---|
| Đã thuộc | ☰ (chỉ hiện khi N>0) | Trang trưng từ đã LEARNED, nhóm theo thời gian (hiện theo `last_lookup_at`) | `review/ui/LearnedCloud.tsx` |
| Thống kê kanji | ☰ | Lưới độ phủ kanji theo JLPT/cấp lớp + progress + "Đánh dấu nhanh" (tạo entry LEARNED 1 chữ) | `features/kanjistats/` |
| Học từ vựng | ☰ | Lưới từ vựng kiểu kanji-grid; nguồn: study list hoặc từ điển cá nhân; click xem nghĩa, double-click toggle nhớ↔quên | `features/vocabstudy/` |
| Từ điển cá nhân | ☰ | Soạn từ điển riêng trong IndexedDB: lưới nhập tay + sinh bằng AI (Deepseek); xuất zip Yomitan; sync đa thiết bị cần Premium | `dictionary/ui/CustomDictionary/`, `data/customDict.ts`, `data/customDictSync.ts` |
| Study list | Nút "＋ Danh sách" trên kết quả tra (cần đăng nhập) | Danh sách từ lưu server; hiện chỉ tạo + thêm (chưa có UI xem/sửa/xoá — xem BACKLOG) | `features/studylist/` |
| Chia sẻ từ điển | Nút "Chia sẻ" trong dropdown Từ điển (cần đăng nhập) | Link tải .zip sống ~5 phút để chuyển từ điển giữa hai máy | `features/share/` |
| Premium | ☰ | Kích hoạt bằng mã (admin sinh); mở khoá sync từ điển cá nhân; SRS sync vẫn miễn phí | `features/premium/` |
| Đóng góp & duyệt | Nút "Đề xuất" trên kết quả (user) · ☰ Duyệt đề xuất (admin) | Đề xuất sửa nghĩa từ điển server, admin duyệt | `features/contribute/` |
| Bình luận / góp ý | Khu cuối panel chi tiết một từ | Bình luận công khai theo từ; guest đọc, đăng nhập mới viết; tác giả/admin xoá | `features/wordcomments/`, server `features/comments/` |
| Kết nối Yomitan | ☰ (cần đăng nhập) | Xuất cấu hình để trình duyệt dùng server này làm nguồn Yomitan | `auth/ui/YomitanSync.tsx`, `yomitan-api/` |
| Viết tay & bộ thủ | Nút ✏️ cạnh ô tra | Vẽ kanji (nhận dạng qua server/Google — cần mạng) + lọc theo bộ thủ (client, offline) + panel gợi ý khớp | `dictionary/ui/HandwritingPad.tsx`, `RadicalPicker.tsx`, `InstantActions.tsx` |
| Skin nền anime | Giao diện → preset | 4 backdrop trang trí lazy-load (panda/buu/cell/akatsuki), tôn trọng reduced-motion | `theme/presets/` |

## 10. Bản đồ chức năng → tài liệu

| Nhóm chức năng | Quy tắc nghiệp vụ | Lưu trữ |
|---|---|---|
| Tra cứu, deinflection, import | [LOGIC §3,6,7,8,9,10,11](./LOGIC.md) | [DB_SCHEMA §2,4](./DB_SCHEMA.md) |
| Word Cloud, ôn tập SRS | [LOGIC §4,5](./LOGIC.md) | [DB_SCHEMA §2.5](./DB_SCHEMA.md) |
| Đồng bộ & tài khoản | [LOGIC §12](./LOGIC.md) | [DB_SCHEMA §5,6](./DB_SCHEMA.md) |
| Theme | [LOGIC §13](./LOGIC.md) | `localStorage` |
</content>
