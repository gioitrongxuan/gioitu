# Chức năng hệ thống — gioitu

> Tài liệu này liệt kê **chức năng** của ứng dụng từ góc nhìn người dùng: làm
> được gì, ở màn hình nào, tương tác ra sao. Mỗi mục dẫn tới nơi cài đặt trong
> mã và quy tắc nghiệp vụ tương ứng ([LOGIC.md](./LOGIC.md)).
>
> Kiến trúc: [ARCHITECTURE.md](./ARCHITECTURE.md). Lược đồ dữ liệu:
> [DB_SCHEMA.md](./DB_SCHEMA.md).

## 0. Bố cục màn hình chính — IA 4 khu

`src/app/App.tsx` lắp ráp app theo **4 khu** ([DESIGN.md §4](./DESIGN.md)),
điều hướng bằng **tab bar dưới đáy** (mobile <760px) / **sidebar trái**
(desktop) — `app/AppNav.tsx` + `app/shell.css`, khu "Hôm nay" đeo badge số từ
đến hạn. **Thanh tra cứu (Search Bar) toàn cục, hiện trên mọi khu** — vòng
lặp gốc của app là *tra → "+" → thấy từ trên bản đồ* nên trang nào cũng tra
được ngay; kết quả mở Detail Panel đè lên trang đang xem:

- **Kho từ** (`/` — **trang chủ**, mở app là thấy bản đồ) — tab con: Bản đồ
  từ (Word Cloud + Filter Bar) · Đã thuộc (`/words/learned`) · Kanji
  (`/words/kanji`) · Học từ vựng (`/words/study`); kèm hàng hành động Thêm
  nhanh · Từ điển cá nhân · Thống kê ôn tập. Path cũ `/learned` `/kanji`
  `/vocabstudy` `/words` vẫn mở đúng trang.
- **Hôm nay** (`/today`) — hero "N từ đến hạn · ~X phút" → vào phiên ôn; chuỗi
  ngày ôn + dải hoạt động 7 ngày (từ `review_log`, tính lại khi phiên ôn đóng);
  "Từ hay quên" (3 thẻ rớt nhiều nhất, bấm mở chi tiết); tài sản "Đã thuộc N
  từ"; lối tắt sang Tra cứu (`app/TodayScreen.tsx`, `review/data/todayStats.ts`,
  `activityByDay`/`mostForgotten` trong `review/domain/reviewStats.ts`).
- **Tra cứu** (`/search`) — trang tra tập trung (không có nội dung khu nào
  khác bên dưới thanh tra); Detail Panel chiếm nguyên trang.
- **Tôi** (`/me`) — tài khoản (Đồng bộ/Đăng nhập/Đăng xuất), cài đặt (Giao
  diện · Kết nối Yomitan · Premium), Xuất/Nhập dữ liệu học, Gửi góp ý về web ·
  Đánh giá ứng dụng; admin thêm Quản lý từ điển · Duyệt đề xuất · Góp ý người
  dùng · Đánh giá của người dùng
  (`app/MeScreen.tsx`). Với **khách**, mục chỉ dùng được khi đăng nhập hiện
  **ổ khoá** (icon SVG) — tường đăng nhập nhất quán, không giấu hẳn cũng không
  mời-rồi-chặn.

Mỗi trang có URL riêng qua History API (F5/refresh giữ chỗ, Back/Forward đi
giữa các trang; `app/routes.ts` + `app/useHistoryRouting.ts`), cộng các lớp
phủ (overlay) mở theo nhu cầu: Detail Panel, Review Session, Dictionary
Manager, Custom Dictionary, Theme Settings, Yomitan Sync, Premium,
Contribution Review, Feedback (gửi + màn admin), Đánh giá (gửi + màn admin),
Quick Add, Auth, Onboarding. Mỗi overlay đang mở chiếm một entry History nên
**Back đóng overlay** thay vì thoát app; từ đang xem trong Detail Panel có
deep-link chia sẻ được dạng `/word/:pair/:term` (vd
`/word/ja-vi/食べる`), mở link là panel mở sẵn từ đó.

```
┌ Sidebar ─┬ Header ────────────────────────────────────────────┐
│ Hôm nay● │ 語 Gioitu        [Từ điển ▾ (cặp + nguồn + import)] │
│ Tra cứu  ├ Search Bar (toàn cục, mọi khu) ─────────────────────┤
│ Kho từ   ├ (dải theo khu: tab con + Filter Bar) ───────────────┤
│ Tôi      ├ Nội dung khu ───────────────────────┐               │
│          │                          Detail Panel │ (khi mở)     │
└──────────┴─────────────────────────────────────┴───────────────┘
  (mobile: sidebar thành tab bar cố định dưới đáy) · Toasts (góc)
```

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
- **Nghe phát âm (#246)**: nút loa cạnh mặt chữ của **từng kết quả** (mỗi kết
  quả một cách đọc riêng nên không gom lên tiêu đề panel). Đọc bằng giọng của
  máy (Web Speech API, `shared/speech.ts`) — offline, không gọi server; tiếng
  Nhật có kana thì đọc kana, còn lại đọc mặt chữ. Bấm lần nữa lúc đang đọc là
  dừng. Trình duyệt không hỗ trợ Web Speech thì ẩn hẳn nút; máy có giọng nhưng
  thiếu gói cho ngôn ngữ đó thì báo bằng toast thay vì im lặng.
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
- **Phân trang**: mở panel thấy ngay `COMMENTS_PAGE_SIZE` bình luận **mới nhất**
  (nhãn khu kèm tổng số); nút **"Xem thêm (N)"** trên đầu danh sách kéo dần phần
  cũ hơn. Server phân trang bằng **con trỏ `(created_at, id)`** (`before_ts` /
  `before_id`), không OFFSET — bình luận mới chèn giữa chừng không làm lệch trang.
- Client `features/wordcomments/` (`domain/` thuần + `test/wordComments.test.ts`,
  `data/` gọi `/api/comments`, `ui/WordComments.tsx`); server `features/comments/`
  + migration `0011_dict_comments`.
- **Đừng nhầm với "Bình luận cộng đồng · Mazii"** — đó là khu khác, read-only,
  nhập kèm từ điển (`entry.comments`, `ui/Media.tsx` → `CommentList`), nằm ngay
  dưới phần nghĩa. Khu này **xếp theo số like giảm dần**
  (`domain/communityComments.ts` → `rankByLikes`, bằng like thì giữ thứ tự gốc)
  rồi hiện sẵn `COLLAPSED_COMMENT_COUNT` cái đầu + nút **"Xem thêm (N)" /
  "Thu gọn"** — thu gọn nhưng vẫn là những ý kiến được tán thành nhất. Dữ liệu
  đã nằm sẵn trong entry nên chỉ là thu/mở, không gọi mạng.

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
- **Nhóm** (chọn ở "Nhóm theo"): thời gian tra (ngày/tháng/năm) hoặc **Trí nhớ**
  — "Khu vườn ký ức" 3 tầng *Sắp quên / Đang bén rễ / Sắp trưởng thành*
  (`srsTier`/`groupBySrsTier`, chỉ dựa trạng thái SRS sẵn có). Tầng nào có từ
  đến hạn thì tiêu đề tầng kèm nút **"Ôn N từ này"** — mở phiên ôn chỉ với các
  từ đến hạn của tầng đó.
- **Popover mini trên mỗi thẻ** (#159): rê chuột đậu trên thẻ, **long-press**
  (mobile) hoặc **chuột phải** mở thẻ tin nhanh — cách đọc, nghĩa đầu, lịch ôn,
  số lần tra (`tagPopoverContent`) + nhãn đang gắn (nếu có) + hành động nhanh:
  **Ôn từ này** (chỉ khi đến hạn), **Nhãn**
  ([9.18](#918-nhãn-cho-thẻ-249)), **Đã thuộc**, **Xoá**. Long-press/chuột phải ghim popover như menu
  (backdrop + Esc đóng, focus qua `useDialog`); popover này **thay** tooltip
  `title` và "Chế độ xoá" toàn cục trước đây. Long-press và vị trí neo là logic
  thuần ở `domain/tagPopover.ts`; UI ở `ui/TagPopover.tsx` + `ui/cloud.css`.
- **Trạng thái rỗng**: "Chưa có từ nào trên bản đồ. Hãy tra một từ để bắt đầu."
  Khi bản đồ trống *vì* bộ lọc thì báo đúng nguyên nhân — nhãn ("Không có từ nào
  mang nhãn…") hoặc "Thêm trong" ("Không có từ nào được thêm trong 7 ngày qua…")
  — thay vì rủ đi thêm từ. Hai bộ lọc cùng che thì gọi tên nhãn.

### Filter Bar (`review/ui/FilterBar.tsx`)

| Điều khiển | Tác dụng |
|---|---|
| **Sắp xếp** | `recent` (mới tra nhất) hoặc `frequency` (tra nhiều nhất) |
| **Nổi bật từ cần ôn** | Làm nổi từ đến hạn, làm mờ phần còn lại |
| **Chỉ hiện từ cần ôn** | Chỉ giữ lại từ đến hạn |
| **Ngôn ngữ** | Cả hai / Tiếng Nhật / Tiếng Anh — lọc bản đồ **và** hàng đợi ôn; nhớ qua `localStorage` (`gioitu.cloudLang.v1`), dùng chung với màn Hôm nay |
| **Thêm trong** | Mọi lúc / 1 · 7 · 30 · 90 ngày qua / **Khoảng ngày…** — khoanh vùng một đợt học theo `created_at` (lúc **thêm** từ, không phải lượt tra); lọc bản đồ **và** hàng đợi ôn; nhớ qua `localStorage` (`gioitu.addedWindow.v1`) |
| **Từ · Đến** (khi chọn "Khoảng ngày…") | Hai ô `<input type="date">` cho đợt học không rơi đúng mốc "N ngày qua" ([#259](https://github.com/gioitrongxuan/gioitu/issues/259)). Cắt theo **ngày địa phương**, bao trọn cả hai đầu; bỏ trống một đầu là để ngỏ đầu đó ("từ 01/05 đến nay"); bỏ trống cả hai = Mọi lúc. Không chọn được ngày ở tương lai |
| **Nhãn** | Tất cả / Chưa gắn nhãn / một nhãn cụ thể kèm số thẻ ([9.18](#918-nhãn-cho-thẻ-249)); chỉ hiện khi kho đã có nhãn |
| **Gắn nhãn AI** | Nhờ AI đề xuất nhãn cho toàn bộ từ đang được lọc, duyệt rồi áp dụng một lượt ([9.18](#918-nhãn-cho-thẻ-249)); chỉ hiện khi đã đăng nhập |
| **Tải ảnh PNG** | Xuất bản đồ đang hiển thị ra ảnh PNG (xem bên dưới) |
| **Ôn tập hôm nay (N)** | Mở phiên ôn tập; vô hiệu khi `N = 0` |
| **Nghe** | Mở [chế độ nghe](#915-chế-độ-nghe-bulk-play-sound); vô hiệu khi không có từ nào nghe được |

### Tải ảnh PNG (`review/ui/wordCloudPng.ts`)

Vẽ lại đúng bản đồ đang hiển thị (cùng bộ lọc ngôn ngữ/sắp xếp/nhóm/chỉ-từ-cần-ôn,
kèm huy hiệu "!" tái quên, màu bám theme hiện hành) lên canvas rồi tải xuống
client-side — không qua server, không thư viện ngoài. Bố cục xếp dòng kiểu
flex-wrap tính thuần ở `domain/exportCloud.ts` (đo chữ bằng `measureText` do lớp
UI inject); phần đuôi canvas→file dùng chung với lưới kanji ở
`shared/ui/pngExport.ts`. Trạng thái nổi bật/làm mờ "từ cần ôn" là tín hiệu hành
động nhất thời, cố ý không tái tạo trong ảnh.

## 3. Phiên ôn tập SRS

`review/ui/ReviewSession.tsx` — overlay lật thẻ, chấm điểm theo SM-2.
(quy tắc: [LOGIC §4](./LOGIC.md))

- **Tiến độ** `còn N · đã ôn M`; thẻ tái quên có nhãn "! tái quên".
- **Thẻ khó nhằn (leech)**: thẻ rớt ≥ `leechLapseThreshold` (=8) lần hiện huy hiệu
  "Khó nhằn" + gợi ý (sửa nghĩa cho dễ nhớ hoặc tạm gác để học riêng). Chỉ
  **cảnh báo**, không tự hoãn/xoá. (`srs.isLeech`, [LOGIC §4.6](./LOGIC.md))
- **Lật thẻ**: mặt trước là từ; bấm để lật xem nghĩa.
- **Luyện chủ động (tuỳ chọn, #164)** — hai toggle ở footer phiên, lưu
  `localStorage`, mặc định tắt:
  - *Gõ cách đọc trước khi lật* (`gioitu.reviewTypeReading.v1`): thẻ tiếng Nhật
    có `reading` hiện ô nhập romaji/kana trước khi lật; sau khi lật hiện gợi ý
    đúng/sai (`domain/readingPractice.ts`). Chỉ là gợi ý mềm — không chặn lật,
    không đụng self-grade/SRS.
  - *Đảo chiều: nghĩa → từ* (`gioitu.reviewReverse.v1`): mặt trước là **nghĩa**,
    người học nhớ lại từ; lật ra từ + cách đọc (mặt sau giữ nguyên MeaningView).
    Thẻ không có nghĩa đọc được thì rơi về mặt từ (`domain/reverseMode.ts`).
    Bật cùng gõ cách đọc: nhìn nghĩa, gõ cách đọc của từ nhớ được rồi lật đối chiếu.
- **Bốn nút tự chấm**: **Again / Hard / Good / Easy**, mỗi nút *xem trước* khoảng
  ôn kế tiếp (gọi thẳng `gradeCard` để tính). Chấm xong nhảy thẻ tiếp.
- **Swipe 4 hướng (#160)**: sau khi lật, kéo thẻ để chấm — **trái Quên · phải
  Nhớ · lên Dễ · xuống Khó** (pointer events, `domain/swipe.ts`). Khi kéo hiện
  chỉ dấu nhãn grade + interval xem trước, đậm dần theo khoảng kéo; thả qua
  ngưỡng thì chốt, dưới ngưỡng thì thôi (vùng chết nhỏ để tap/bấm trong thẻ
  không bị nhận nhầm). Thẻ có nội dung dài (cuộn được) nhường trục dọc cho cuộn
  chạm — chạm chỉ còn swipe trái/phải, Dễ/Khó vẫn có nút và phím; chuột không
  bị giới hạn này.
- **Haptic**: rung nhẹ (`navigator.vibrate`, 15ms) ngay lúc chốt grade — mọi
  ngả swipe/nút/phím; trình duyệt không hỗ trợ (iOS Safari) thì bỏ qua.
- **Dấu son 合格 (DESIGN §5)**: từ chuyển sang **LEARNED** trong phiên → dấu son
  `--seal` đóng một lần lên thẻ (kèm tên từ), tự mờ đi sau ~1,5s — animation chỉ
  transform/opacity, có guard `prefers-reduced-motion` (hiện tĩnh rồi tự gỡ).
  Hiện ở cả màn hết lô/hoàn thành để thẻ cuối phiên tốt nghiệp không mất khoảnh khắc.
- **Ưu tiên quá hạn lâu**: trong phiên, thẻ quá hạn lâu nhất được phục vụ trước.
- **Chia lô ~20 thẻ**: phiên phục vụ từng lô `REVIEW_BATCH_SIZE` (=20) thẻ; hết
  lô mà còn thẻ đến hạn thì hiện lời mời **"Ôn tiếp N thẻ nữa"** (điểm dừng tự
  nhiên). Hàng đợi ≤ 20 thì không có bước hỏi này.
- **Hoàn thành**: "Hoàn thành!" + số thẻ đã ôn; có thể **Kết thúc phiên** bất
  cứ lúc nào.

Hàng đợi là `store.dueEntries` (`isDue`: `next_review ≤ now`) **lọc theo ngôn ngữ
và cửa sổ "Thêm trong" đang chọn** — cùng một lựa chọn cho cả hai lối vào (nút
Hôm nay và Filter Bar). Tiêu đề tab / huy hiệu PWA / huy hiệu nav vẫn đếm **tổng**
không lọc, nên khi bộ lọc vét sạch hàng đợi màn Hôm nay nói rõ bộ lọc nào đang
che ("Không có từ *tiếng X* *thêm trong 7 ngày qua* đến hạn") thay vì báo đã ôn
xong. Phiên **chụp một lần** lúc mở rồi tự xếp thứ tự + chia lô (`review/domain/session.ts`,
[LOGIC §4.8](./LOGIC.md)). Khi một từ vượt ngưỡng `matureThreshold` (21 ngày) nó
`→ LEARNED` và rời bản đồ; nếu rớt ngưỡng trở lại thì `→ RELAPSED`.

Mỗi lượt chấm ghi một dòng **nhật ký ôn tập** (`review_log`, append-only) làm nền
cho FSRS về sau — cục bộ, chưa đồng bộ cloud; màn **Thống kê ôn tập** ([§9.12](#912-thống-kê-ôn-tập))
đọc nhật ký này. Chi tiết: [LOGIC §4.7](./LOGIC.md), [DB_SCHEMA §2.6](./DB_SCHEMA.md).

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
- **Sao lưu kèm lịch sử ôn (Premium, #165)**: với người đã kích hoạt Premium,
  file xuất (format v2) đính kèm `review_log` đầy đủ. Nhập lại KHÔNG cần
  Premium (gate nằm ở lúc xuất): chỉ ghi bổ sung các dòng chưa có
  (`missingLogRows`, khoá `term+lang+ts+grade`) nên nhập cùng file hai lần
  không nhân đôi lịch sử; `id` nguồn bị bỏ để IndexedDB đích tự cấp. File v1
  không có trường này thì bỏ qua êm; có mà méo dạng thì chặn như entries hỏng.

## 7. Thông báo (Toasts)

`shared/ui/Toasts.tsx` — thông báo tạm (tự ẩn ~4s), ba loại `info`/`warn`/
`success`. Một số thời điểm hiện toast (`review/state/store.ts`):

| Sự kiện | Loại | Nội dung |
|---|---|---|
| Tra lại một từ đã thuộc (relapse) | warn | `Bạn đã quên lại từ "<từ>"` |
| Từ vào hàng đợi ôn tập (khi bấm `＋`) | success | `"<từ>" đã vào hàng đợi ôn tập` |
| Từ tốt nghiệp → đã thuộc | success | `"<từ>" đã thuộc` |
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
- Service worker (`public/sw.js`) precache **toàn bộ asset build, kể cả chunk
  lazy** (Bộ thủ, Kanji, skin…) — danh sách được chèn lúc build (plugin
  sw-precache trong `vite.config.ts`, logic ở `src/app/swPrecache.ts`) nên các
  màn phụ mở được offline ngay cả khi chưa từng ghé; mỗi deploy SW chỉ tải phần
  chunk đổi hash và dọn hash cũ khỏi cache ở `activate`.

## 9. Các tính năng bổ sung (2026)

> Các màn/tính năng mọc sau bản SPEC gốc. Bảng dưới là mục lục nhanh (lối vào ·
> mục đích · nơi cài đặt); chi tiết UX ở các mục §9.1–§9.12 kế tiếp. Khi thêm
> tính năng mới, cập nhật cả bảng lẫn một mục chi tiết ở đây (cổng review mỗi PR
> tính năng — xem CLAUDE.md).

| Tính năng | Lối vào | Mô tả ngắn | Chi tiết |
|---|---|---|---|
| Đã thuộc | ☰ (chỉ hiện khi N>0) | Trang trưng từ đã LEARNED, nhóm theo thời gian | [§9.1](#91-đã-thuộc-learnedcloud) |
| Thống kê kanji | ☰ | Lưới độ phủ kanji theo nhóm + "Đánh dấu nhanh" | [§9.2](#92-thống-kê-kanji) |
| Thống kê ôn tập | ☰ | Retention theo ngày + dự báo đến hạn 7 ngày + đường từ đã thuộc | [§9.12](#912-thống-kê-ôn-tập) |
| Học từ vựng | ☰ | Lưới ô từ (3 nguồn) để đánh dấu biết/không biết | [§9.3](#93-học-từ-vựng) |
| Từ điển cá nhân | ☰ | Soạn từ điển riêng trong IndexedDB (nhập tay + AI) | [§9.4](#94-từ-điển-cá-nhân) |
| Study list | (chưa nối vào UI) | Bộ từ lưu server; client mới chỉ đọc qua Học từ vựng | [§9.5](#95-study-list) |
| Chia sẻ từ điển | Nút "Chia sẻ" ở mỗi từ điển trên máy | Link tải .zip sống ~5 phút để chuyển máy | [§9.6](#96-chia-sẻ-từ-điển) |
| Premium | ☰ | Trang giá trị retention + kích hoạt bằng mã | [§9.7](#97-premium) |
| Đóng góp & duyệt | Panel chi tiết (user) · ☰ Duyệt đề xuất (admin) | Đề xuất sửa nghĩa từ điển server, admin duyệt | [§9.8](#98-đóng-góp--duyệt) |
| Bình luận / góp ý | Cuối panel chi tiết một từ | Bình luận công khai theo từ (xem §1) | [§1](#bình-luận--góp-ý-cho-từ-23) |
| Đánh giá ứng dụng | Tôi → Đánh giá ứng dụng · Tôi → Đánh giá của người dùng (admin) | Chấm 1–5 sao + nhận xét về app, mỗi tài khoản một phiếu sửa được | [§9.16](#916-đánh-giá-ứng-dụng-245) |
| Góp ý về web | Tôi → Gửi góp ý về web · Tôi → Góp ý người dùng (admin) | Người dùng gửi góp ý/báo lỗi về app, admin đọc và đánh dấu đã xử lý | [§9.17](#917-góp-ý-về-web-244) |
| Kết nối Yomitan | ☰ (cần đăng nhập) | Cấu hình để Yomitan đẩy từ đã lưu về server này | [§9.9](#99-kết-nối-yomitan) |
| Viết tay & bộ thủ | Nút ✏️/部 cạnh ô tra (chỉ khi tra tiếng Nhật) | Vẽ kanji + lọc bộ thủ + panel gợi ý khớp | [§9.10](#910-viết-tay--bộ-thủ) |
| Skin nền anime | Giao diện → Bộ sưu tập skin | 4 skin (backdrop + heatmap) mở khoá theo chuỗi ngày ôn, lazy-load, tôn trọng reduced-motion | [§9.11](#911-skin-nền-anime) |
| Lịch sử tra cứu | Khu Tra cứu, khi chưa mở từ nào | "Tra gần đây" + "Tra nhiều nhất" của chính người dùng, bấm là tra lại | [§9.19](#919-lịch-sử-tra-cứu-269) |
| Chế độ nghe | Nút "Nghe" cạnh "Ôn tập hôm nay" | Máy đọc liên tục các từ đang học; không SRS | [§9.15](#915-chế-độ-nghe-bulk-play-sound) |
| Chế độ hình ảnh | Nút "Hình ảnh" cạnh "Nghe" | Trình chiếu ảnh minh hoạ của từ đang học; không SRS | [§9.20](#920-chế-độ-hình-ảnh-263) |

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
- **Tải ảnh PNG** (nút "Tải ảnh PNG" cạnh legend): vẽ lại đúng dữ liệu đang hiển
  thị (nhóm/không nhóm, gồm cả ô `missing` nếu đang bật "Hiện kanji chưa biết")
  lên canvas rồi tải xuống client-side — không qua server, không thư viện ngoài
  (`ui/kanjiGridPng.ts`, layout thuần ở `domain/exportGrid.ts`). Word Cloud có
  nút tương ứng — xem [§2](#2-word-cloud-bản-đồ-từ).

### 9.3 Học từ vựng

Lưới ô từ (kiểu kanji-grid) để duyệt nhanh và tự đánh dấu biết/không biết. Mục
menu **Học từ vựng** luôn hiện. (`features/vocabstudy/`, `App.tsx:294,407-421`)

- **Bốn nguồn** (dropdown "Nguồn danh sách"):
  - *Lịch sử* (mặc định): chính `store.entries`, lọc theo cặp ngôn ngữ đang chọn.
  - *Từ điển cá nhân*: nạp toàn bộ một từ điển tự soạn từ IndexedDB (không phân
    trang — từ điển cá nhân thường nhỏ).
  - *Study list*: bộ từ trên server, **cần đăng nhập** (chưa đăng nhập thì hiện
    lời mời).
  - *Bộ từ nhập*: danh sách nhập từ ngoài để **sàng** — xem §9.21.
- **Phủ tiến độ** (`domain/vocablist.ts`): `applyProgress` chồng entry SRS lên
  danh sách nguồn theo khoá `(term, term_lang)`, phân loại 4 trạng thái —
  `learned` / `due` (đến hạn) / `learning` / `missing` — và tô sắc độ tương ứng
  (learned đậm nhất, missing viền đứt). Ô đã thuộc có dấu ✓.
- **Tóm tắt + lọc**: dòng "Đã thuộc N/T (P%) · đang học · cần ôn · chưa học" và
  thanh tiến độ; dropdown "Lọc theo" (tất cả / chưa học / đang học / đến hạn / đã
  thuộc).
- **Tương tác**: một cú bấm, hành vi tuỳ chế độ — thường là xem nghĩa
  (read-only, không đếm lượt tra), bật ô "Đánh dấu nhanh" thì bấm là toggle
  nhớ↔quên (`markForgottenEntry` nếu đang LEARNED, ngược lại `markKnownByTerm`),
  kèm toast Hoàn tác. Click-đúp cũ đã bỏ (kém ổn định trên cảm ứng).
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

Gói trả phí định vị quanh **retention** (#165): giữ lại và soi được lịch sử
học, không chỉ đồng bộ. Mục menu **Premium** (hiện "Premium ✓" khi đã kích
hoạt) mở **trang giá trị** — kể lợi ích trước, ô nhập mã sau; lợi ích hiện cả
với khách (đọc được trước khi bị đòi đăng nhập). (`features/premium/`)

- **Bốn giá trị** (hằng `BENEFITS` trong `PremiumModal.tsx`): thống kê nâng cao
  (§9.12) · sao lưu kèm lịch sử ôn (§6) · đồng bộ từ điển cá nhân đa thiết bị
  (§9.3; SRS vẫn đồng bộ **miễn phí**) · AI phân tích câu ví dụ (Deepseek, luồng
  Yomitan "+"). Marker danh sách là chấm CSS `--accent`, không emoji
  (`premium/ui/premium.css`).
- **Kích hoạt (user)**: cần đăng nhập (Premium gắn theo tài khoản). Nhập mã dạng
  `ABCD-EFGH-JKMN` → `redeemPremiumCode` (`POST /api/premium/redeem`); thành công
  thì cập nhật cache phiên (`markSessionPremium`) để UI/cổng đồng bộ phản ánh
  ngay, hiện "✓ Tài khoản đã kích hoạt Premium." Lỗi server hiện inline. Chưa
  đăng nhập thì thay ô nhập mã bằng lời mời đăng nhập.
- **Admin sinh mã**: chỉ hiện khi `isAdmin`. Liệt kê mã (mới nhất trước,
  `GET /api/premium/codes`); nút "Tạo 5 mã mới" (`POST …`, `count: 5`). Mỗi mã
  hiện trạng thái đã dùng / chưa dùng theo `redeemed_by`.

### 9.8 Đóng góp & duyệt

Cộng đồng đề xuất **thêm từ / sửa nghĩa** cho **từ điển server dùng chung**, admin
duyệt. (`features/contribute/`)

- **Đề xuất (user)** — hai lối vào, cùng đi qua `proposeWord`
  (`POST /api/contribute`) và cùng dựng payload ở `contribute/domain/proposal.ts`.
  Chỉ hiện khi đã đăng nhập (đề xuất gắn với tài khoản); thành công thì toast "Đã
  gửi đề xuất, chờ admin duyệt", lỗi hiện inline cạnh nút và nút KHÔNG chuyển sang
  "Đã đề xuất".
  - **Từ một thẻ kết quả tra** (`onPropose` → `proposalFromDictEntry`): `gloss`
    lấy từ `senses` (hoặc `definitions`), `pos` là tag từ loại đã dedupe.
  - **Từ một từ trong kho mà từ điển không có** (`onProposeEntry` →
    `proposalFromVocabEntry`): dành cho từ tự thêm (Thêm nhanh, Yomitan, tự định
    nghĩa). Panel chi tiết hiện dòng "Từ này chưa có trong từ điển." + nút **Đề
    xuất thêm vào từ điển** khi tra xong mà không có kết quả nào (`!error`,
    `!pending` — mất mạng hay còn quét near-miss thì chưa kết luận) và từ đã có
    ghi chú của người dùng: chính ghi chú đó là `gloss` gửi lên, `pos` tách từ
    trường `pos` đã lưu. (`DetailPanel.tsx`, `App.tsx` `propose`)
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
- **Link cài tiện ích**: mục "Cài tiện ích Yomitan" đưa sẵn link store chính thức
  (Chrome · Edge · Firefox), store khớp trình duyệt hiện tại xếp đầu và tô đậm;
  Safari/iOS không đoán được nên hiện cả ba. Hiện cho cả guest vì cài không cần
  tài khoản. (`auth/domain/yomitanStores.ts`)
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

Bộ sưu tập skin gắn chuỗi ngày ôn (#162). Một skin CHỈ đổi backdrop + hai đầu
heatmap — token chữ/nền của người dùng giữ nguyên
(DESIGN §1), nên skin mặc được trên cả nền sáng lẫn tối. Lối vào: **Giao diện**
→ mục "Bộ sưu tập skin" + công tắc "Hiện hoạ tiết nền". (`theme/domain/skins.ts`,
`theme/presets/`, `theme/ui/ThemeBackdrop.tsx`, `ThemeSettings.tsx`)

- **Bốn skin** (`domain/skins.ts`, hiệu ứng đăng ký ở `presets/registry.ts`,
  khoá `BackgroundEffect`): `panda` (Rừng trúc, hiệu ứng `bamboo`) · `buu`
  (Majin Buu) · `cell` · `akatsuki`.
- **Mở khoá theo streak**: chuỗi ngày ôn tính từ `review_log` cục bộ
  (`review/domain/streak.ts`, ngày theo 0h máy; hôm nay chưa ôn thì chuỗi kết
  thúc hôm qua chưa coi là đứt). Mốc: Rừng trúc 3 · Majin Buu 7 · Cell 14 ·
  Akatsuki 30 ngày, xét theo chuỗi **dài nhất** từng đạt. Skin đã mở giữ vĩnh
  viễn (danh sách lưu `localStorage` khoá `gioitu.skins.v1`); skin đang mặc từ
  trước khi có gating được giữ luôn. App inject `loadReviewStreak` vào
  `ThemeSettings` — theme không import ngược sang review.
- **Lazy-load**: mỗi hiệu ứng là một `lazy(() => import(...))` riêng, render trong
  `<Suspense fallback={null}>` ở lớp `.theme-backdrop` (fixed, `z-index: -1`,
  `pointer-events: none`) — skin không chọn thì không tải component/CSS/ảnh. Không
  render khi tắt hiệu ứng (`effectsEnabled`).
- **Reduced-motion**: mỗi background đặt `data-speed` + biến `--fx-drift`; CSS
  đóng băng animation khi OS bật "giảm chuyển động" hoặc khi `data-speed="none"`
  (`styles.css:483-486`) — hoạ tiết vẫn hiện nhưng đứng yên.

### 9.12 Thống kê ôn tập

Overlay đọc `review_log` (IndexedDB, cục bộ) + danh sách entry, dựng bằng SVG
thuần (không thư viện chart). Lối vào: ☰ → **Thống kê ôn tập**. Mở cho mọi
người (guest lẫn đăng nhập); riêng mục "Nâng cao" gate Premium (#165).
(`review/ui/ReviewStats/`, logic thuần ở `review/domain/reviewStats.ts`)

- **Hàng ô số liệu**: Tỉ lệ nhớ 30 ngày · Lượt ôn 30 ngày · Đã thuộc (màu
  `--seal` thành tựu) · Đến hạn 7 ngày tới.
- **Tỉ lệ nhớ theo ngày** (30 ngày): chỉ tính lượt chấm có `interval_before`
  ≥ 1 ngày — "true retention" kiểu Anki, các bước học 1–10 phút không tính;
  ngày không ôn là khoảng hở thật trên biểu đồ (không nối xuyên).
- **Dự báo đến hạn 7 ngày**: cột theo ngày từ `next_review`; thẻ đã quá hạn
  dồn vào "Hôm nay". Giả định ôn đúng hạn, không mô phỏng reschedule.
- **Từ đã thuộc theo thời gian**: đường luỹ kế theo `learned_at` (fallback
  `last_lookup_at`), chỉ đếm entry đang LEARNED — điểm cuối luôn khớp "Đã
  thuộc (N)"; từ tái quên rời khỏi đường (tả tài sản hiện có, không phải lịch
  sử đầy đủ).
- **Nâng cao · Premium (#165)**: tỉ lệ nhớ tách theo **khoảng ôn**
  (`retentionByInterval`, 4 nhóm `INTERVAL_BANDS`: 1–6 ngày · 1–4 tuần ·
  1–3 tháng · >3 tháng — thẻ non yếu ≠ thẻ chín yếu) + nút **tải toàn bộ lịch
  sử ôn ra CSV** (`reviewLogToCsv` ở `domain/reviewLog.ts`; BOM UTF-8 cho
  Excel, không lộ `user_id`/`id`). Người chưa Premium thấy khối này **mờ**
  (blur + `inert`, dữ liệu vẫn là của chính họ — khoá ở thao tác, không ở bí
  mật) kèm nút "Tìm hiểu Premium" mở trang giá trị (§9.7).
- Toàn bộ phép tính là hàm thuần nhận `now` từ caller (không `Date.now()`
  trong domain) — nền đối chiếu cho FSRS khi đủ log.

### 9.13 Onboarding lần đầu (#152)

Màn chào 3 bước (overlay, `app/Onboarding.tsx`) cho lần mở app đầu tiên:
(1) triết lý tra-là-tín-hiệu-quên → bấm "+", (2) chọn nguồn từ điển + nút
**"Tải từ điển đề xuất" một chạm**, (3) nhịp ôn mỗi ngày ở màn Hôm nay.

- **Chỉ chào người mới thật sự**: quyết định thuần `decideOnboarding` ở
  `app/onboarding.ts` — đã có dữ liệu học hoặc từ điển local (người dùng từ
  trước khi có onboarding) thì đánh dấu "đã xem" trong im lặng; cờ nhớ ở
  localStorage `gioitu.onboarded.v1`. Mọi ngả đóng (Bỏ qua / Bắt đầu /
  Escape / Back) đều đánh dấu đã xem.
- **Từ điển đề xuất host trên chính server** (cùng origin — không vướng
  CORS): admin thả file .zip Yomitan + `manifest.json` (mảng
  `{file, name, description?, source, target}`) vào thư mục
  `GIOITU_DICTS_DIR` (mặc định `<cwd>/dicts`); client hỏi
  `GET /api/dict/recommended?source&target` rồi tải qua `importYomitanUrl`
  (`server/features/dictionary/recommendedRoutes.ts`,
  `dictionary/data/recommended.ts`). Server chưa cấu hình gói đề xuất →
  trả `[]`, UI tự ẩn nút (vẫn tra được bằng nguồn Server).
- Cài xong, nguồn tra chuyển sang "Trên máy" cho phiên hiện tại nhưng
  **không ghi lựa chọn** — cùng ngữ nghĩa auto-default lúc mở app; lựa chọn
  chỉ được lưu khi người dùng tự chọn ở dropdown "Từ điển".
- **Lối vào thẳng bước từ điển**: `?dicts=1` mở màn chào ngay ở bước 2 kể cả
  khi cờ "đã xem" đã bật (`wantsDictSetup` ở `app/firstRun.ts`, prop
  `startStep` của `Onboarding`) — người dùng chủ động tới đây thì
  `decideOnboarding` không xen vào. Param bị xoá khỏi URL sau khi đọc như
  luồng `?add=`. Extension dùng lối này lúc mới cài (§9.14).

### 9.14 Thêm nhanh khi lướt web (#194)

Lượm một từ gặp ngoài app (từ chưa có trong từ điển) mà không đứt mạch đọc.
Form Thêm nhanh (`dictionary/ui/QuickAdd/`) lưu vào **cả hai kho**: hàng ôn SRS
(`recordLookup`) + hộp thư "Từ nhặt được" trong từ điển cá nhân
(`dictionary/data/inbox.ts` — tra lại thấy ở nguồn *Trên máy*). Nút AI điền hộ
(cần đăng nhập) dùng chung engine với Từ điển cá nhân; ngay dưới nút là ô "Yêu
cầu thêm cho AI" (tuỳ chọn — ngữ cảnh gặp từ, lĩnh vực, sắc thái) đi vào prompt
qua `extra` của `buildAiPrompt`, giữ nguyên sau khi lưu vì lượm nhiều từ liên
tiếp thường cùng một ngữ cảnh (#274).

Các ngả vào, đều quy về query param `?add=<mặt chữ>` (đọc một lần lúc mount rồi
xoá khỏi URL; parse thuần ở `domain/quickadd.ts::parseAddParams`):

- **Menu ☰ → Thêm nhanh**: form trống ngay trong app.
- **Extension Chrome/Edge** (`extension/` — chuột phải / `Ctrl/⌘+Shift+Y` / nút
  toolbar): overlay Shadow DOM hiện **ngay trên trang đang đọc**, soạn mặt
  chữ/cách đọc/nghĩa tại chỗ; Lưu → extension mở tab nền
  `?add=…&add_save=1` — app tự lưu (khi đủ mặt chữ + nghĩa) rồi tự đóng tab.
  Trang cấm chèn script thì rơi về cửa sổ popup mở form đầy đủ. Nút "Form đầy
  đủ" trên overlay cũng mở popup đó, mang theo phần đã soạn dở.
  Lúc **mới cài** (`onInstalled` với `reason === "install"`, không phải mỗi lần
  nâng cấp) extension mở một tab `<địa chỉ Gioitu>/?dicts=1` dẫn thẳng vào bước
  cài từ điển về máy (§9.13); trang Tuỳ chọn có nút "Cài từ điển về máy…" mở
  lại lối đó. Từ điển chỉ nằm trong IndexedDB của origin app — extension khác
  origin nên không đọc được và **không giữ bản sao** (#251).
- **Bookmarklet "＋ Gioitu"** (kéo từ cuối form lên thanh dấu trang): mồi tải
  `public/qa-overlay.js` (bản song sinh của overlay extension — lưu qua cửa sổ
  tí hon góc màn hình, app ghi xong tự đóng) → cùng trải nghiệm soạn tại chỗ.
  Trang có CSP chặn script ngoài thì rơi về cửa sổ popup 520×680 mở form như cũ.
- **Share Target Android** (`manifest.webmanifest`): bôi đen ở app bất kỳ →
  Chia sẻ → Gioitu (map `text→add`, `title→add_title`; cần cài PWA). iOS chưa có.

Cặp ngôn ngữ đoán theo chữ viết (`guessPairForText`: có chữ Nhật → Nhật→Việt,
còn lại → Anh→Việt), đổi được trong form/overlay.

**AI điền trên overlay ngoài trang**: overlay không gọi được API app (khác
origin, token nằm trong localStorage origin app) nên mượn app làm hộ — nút "AI
điền" mở cửa sổ tí hon `?add=…&add_ai=1&add_origin=<origin trang>`; App nhận
`add_ai` (`parseAddParams`) chỉ vẽ một dòng trạng thái (`.qa-proxy`), gọi
`aiFillDraft` (`dictionary/data/aiGenerate.ts` — dùng chung với nút AI trong
form) rồi `postMessage({kind:"gioitu-ai-fill", filled|error})` về
`window.opener` đúng `add_origin` và tự đóng. Overlay chỉ nhận message từ đúng
origin app, chỉ điền ô trống; từ loại/ví dụ/ghi chú AI trả về được giữ lại gửi
kèm lúc lưu (`add_pos`/`add_example`/`add_note`). Chưa đăng nhập → báo lỗi ngay
trên overlay.

**Cửa sổ popup riêng cho form** (`add_solo=1` — extension/bookmarklet mở "Form
đầy đủ" hoặc fallback CSP): App chỉ vẽ form Thêm nhanh + toast, không dựng vỏ
app; đóng form là đóng cửa sổ.

**Tra hộ overlay ngoài trang** (`?lookup=<mặt chữ>` — #251): cùng lý do với AI
điền, overlay không đọc được IndexedDB của app (khác origin) nên nhờ app tra hộ.
Cửa sổ tí hon `?lookup=…&lookup_pair=<cặp>&lookup_origin=<origin trang>` chỉ vẽ
một dòng trạng thái (`.qa-proxy`), chạy lượt tra rồi
`postMessage({kind:"gioitu-lookup", hits, source, error?})` về `window.opener`
đúng `lookup_origin` và tự đóng. Parse + dựng payload là logic thuần
(`domain/lookupProxy.ts`), phần chạy tra ở `data/lookupProxy.ts`.

- **Ngoại lệ nguồn**: riêng luồng này tra **Trên máy trước, hết mới hỏi Server**
  (`PROXY_SOURCE_ORDER`) — overlay không đọc được lựa chọn nguồn của app để mà
  tôn trọng. Người dùng tra trong app vẫn đi qua `search.ts`: nguồn nào được
  chọn thì tra đúng nguồn đó (§4).
- Mỗi lượt trả tối đa 5 dòng (mặt chữ · cách đọc · một dòng nghĩa), gộp trùng
  theo (mặt chữ, cách đọc). Không nguồn nào có từ mà server lại hỏng thì payload
  mang `error` để overlay báo "không tra được" chứ không báo nhầm "không có từ".
- Mở thẳng URL này bằng tay (không có `window.opener`) thì app bỏ chế độ proxy
  và mở bình thường.
- **Phía overlay** (`extension/overlay.js` + bản song sinh `public/qa-overlay.js`):
  nút **"Tra nghĩa"** đứng trước AI điền — lối rẻ hơn, không cần đăng nhập và
  chạy cả khi offline nếu từ điển đã ở IndexedDB. Kết quả hiện thành danh sách
  bấm được (*mặt chữ【cách đọc】· nghĩa*); dòng đầu chỉ điền vào **ô còn trống**
  (như AI điền), bấm một dòng là chọn tay nên **đè** cả ô đã có. Overlay bỏ qua
  message sai origin, sai `kind`, hoặc của mặt chữ khác (bấm tra liền hai lần);
  đổi mặt chữ là dọn danh sách. Ba trạng thái nói khác nhau: có kết quả (kèm nguồn
  đã trả lời), "không có trong từ điển đã cài", và "không tra được" (cờ `error`).
  Quá 20 giây không thấy trả lời thì báo nghi cửa sổ proxy bị chặn — nút không
  disabled vĩnh viễn.
- **Vì sao là nút, không tự tra khi overlay mở**: overlay được chèn theo cử chỉ ở
  UI trình duyệt (chuột phải / phím tắt / nút toolbar), lúc ấy trang **không có
  user activation** nên `window.open` bị popup blocker chặn. Một cú bấm ngay trên
  overlay mới mở được cửa sổ proxy.

### 9.15 Chế độ nghe (bulk play sound)

Ôn bằng tai lúc không rảnh mắt: máy đọc liên tục các từ đang học, người dùng chỉ
nghe. **Không SRS** — không chấm điểm, không ghi `review_log`, không đụng
`next_review`. Mở từ nút **Nghe** cạnh "Ôn tập hôm nay".

- **Nguồn từ**: toàn bộ từ đang học trên bản đồ (`LEARNING` + `RELAPSED`) thuộc
  ngôn ngữ đang chọn, bỏ những từ không có nghĩa đọc được — **không** theo hạn
  ôn, nên nghe được cả khi hôm nay không còn thẻ đến hạn.
- **Mỗi thẻ**: đọc mặt chữ **2 lần** → khoảng lặng (2/4/6 giây, chỉnh được) để
  tự nhớ lại → đọc nghĩa. Tiếng Nhật có kana thì đọc kana (kanji đứng một mình
  hay bị đọc sai âm).
- **Danh sách phát**: xáo trộn, chạy vòng vô hạn tới khi dừng; hết vòng thì dựng
  lại từ dữ liệu mới nhất và **xáo lại** để không thuộc lòng theo thứ tự.
- **Màn phát** (`review/ui/ListenSession.tsx`): chữ cỡ lớn, nghĩa chỉ hiện đúng
  lúc máy đọc nghĩa (liếc màn hình vẫn là một lượt tự kiểm tra). Cả vùng chữ là
  nút phát/dừng khổng lồ; thêm Từ trước / Từ sau và hai ô chọn Tốc độ
  (chậm/bình thường/nhanh) + Khoảng lặng. Cài đặt nhớ ở `gioitu.listen.v1`.
- **Kỹ thuật**: Web Speech API thuần client (`shared/speech.ts` — dùng chung với
  nút phát âm ở từ điển) — offline, miễn phí, không gọi server. Logic *đọc gì*
  nằm thuần ở `review/domain/listen.ts`.
  Giữ màn hình sáng bằng Wake Lock (`review/data/wakeLock.ts`).
- **Giới hạn đã biết**: giọng đọc của trình duyệt **tắt khi khoá màn hình hoặc
  chuyển app** — chế độ này dành cho lúc màn hình còn bật mà mắt bận (nấu ăn,
  gấp đồ), chưa phát được khi bỏ máy trong túi. Máy thiếu gói giọng cho ngôn
  ngữ đang nghe thì màn phát báo ngay thay vì im lặng khó hiểu.

### 9.16 Đánh giá ứng dụng (#245)

Người dùng chấm điểm *chính app* (khác §1 — bình luận về một **từ**, và khác
đề xuất sửa nghĩa ở §9.8). (`features/rating/`)

- **Chấm điểm (user)**: mục **Đánh giá ứng dụng** ở khu Tôi mở `RatingDialog` —
  chọn **1–5 sao** + nhận xét ngắn **tuỳ chọn** (trần 500 ký tự, có đếm), rồi
  `POST /api/ratings`. Mở form ra là thấy sẵn phiếu cũ của mình
  (`GET /api/ratings/mine`), gửi lại là **sửa** phiếu đó chứ không thêm dòng mới.
- **Cần đăng nhập**: điểm trung bình chỉ có nghĩa khi mỗi người một phiếu, mà
  nặc danh thì không giữ được điều đó. Khách thấy ổ khoá ở mục menu và lời mời
  đăng nhập trong dialog — không bị chặn sau khi đã chấm xong.
- **Đọc (admin)**: mục **Đánh giá của người dùng** (chỉ admin) mở `RatingReview`
  — điểm trung bình (một chữ số thập phân, dấu phẩy kiểu Việt; chưa có phiếu nào
  thì "—" chứ không phải 0,0), phân bố theo mức sao (5 sao trước), rồi danh sách
  phiếu **mới sửa gần nhất trước** kèm email người chấm và "N giờ trước".
- **Lưu trữ**: bảng `app_ratings` trên Postgres (migration `0013_app_ratings`) —
  `user_id` là **khoá chính** (một người một phiếu), `stars` có `CHECK` 1–5,
  `note`, `created_at`, `updated_at`. Trung bình và phân bố tính bằng SQL trên
  toàn bảng, không suy từ danh sách (danh sách có trần 200 nên sẽ sai khi vượt).
  Email **không** lưu ở đây: join `users` lúc đọc.
- **Luật kiểm tra** nằm thuần ở `rating/domain/rating.ts` (`checkRating`: mức sao
  trong thang, trim nhận xét, trần độ dài; `distributionRows`, `formatAverage`)
  và server kiểm lại đúng các luật đó trong `ratingStore.submit` — client không
  phải bức tường duy nhất.

### 9.17 Góp ý về web (#244)

Kênh để người dùng nói *về chính app* bằng lời (muốn sửa gì, cần tính năng gì) —
khác §1 (bình luận về một **từ** trong từ điển) và khác §9.16 (chấm sao).
(`features/feedback/`)

- **Gửi (user)**: mục **Gửi góp ý về web** ở khu Tôi mở `FeedbackDialog` — chọn
  loại (**Báo lỗi** / **Ý tưởng / tính năng mới** / **Khác**) + nội dung (trần
  2000 ký tự, có đếm), rồi `POST /api/feedback`. Gửi xong dialog chuyển sang lời
  cảm ơn thay vì đóng ngay (phản hồi xác nhận điều đã thật sự xảy ra).
- **Cần đăng nhập**: góp ý nặc danh mở đường cho spam và admin cần biết hỏi lại
  ai. Khách thấy ổ khoá ở mục menu và lời mời đăng nhập trong dialog — không bị
  chặn sau khi đã gõ xong.
- **Đọc (admin)**: mục **Góp ý người dùng** (chỉ admin) mở `FeedbackReview` —
  mới nhất trước, mặc định chỉ phần đang chờ (`GET /api/feedback`), ô **Hiện cả
  đã xử lý** đổi sang `?status=all`. Mỗi mục hiện loại, email người gửi, "N giờ
  trước" và nguyên văn nội dung; nút **Đánh dấu đã xử lý**
  (`POST /api/feedback/:id/handled`) gỡ khỏi danh sách đang chờ. Rỗng: "Không có
  góp ý nào đang chờ."
- **Lưu trữ**: bảng `feedback` trên Postgres (migration `0014_feedback`) —
  `user_id`, `kind`, `message`, `status` (`new` | `handled`), `created_at`, kèm
  `handled_by`/`handled_at`. Email **không** lưu ở đây: join `users` lúc đọc nên
  không có bản sao lạc hậu.
- **Luật kiểm tra** nằm thuần ở `feedback/domain/feedback.ts` (`checkFeedback`:
  trim, rỗng, trần độ dài, loại hợp lệ) và server kiểm lại đúng các luật đó
  trong `feedbackStore.submit` — client không phải bức tường duy nhất.

### 9.18 Nhãn cho thẻ (#249)

Người dùng tự gắn **nhãn** phân loại cho từng thẻ ("ngữ pháp", "N3", "chỗ làm"…)
rồi lọc bản đồ từ theo nhãn. Trong code gọi là `label` chứ không phải `tag`, vì
"tag" trong repo đã là thẻ từ trên Word Cloud (`CloudTag`) và tag từ loại Yomitan.

- **Lưu ở đâu**: `VocabEntry.labels` (mảng chuỗi, optional) — đi cùng entry qua
  LWW như mọi field khác, không có store riêng, **không** bump `DB_VERSION`.
- **Chuẩn hoá** (`review/domain/labels.ts`, logic thuần): cắt khoảng trắng, bỏ
  `#` mở đầu, tối đa 24 ký tự và 8 nhãn mỗi thẻ; khử trùng **không phân biệt hoa
  thường** (giữ cách viết gặp đầu tiên). Danh sách không đổi thì store bỏ qua,
  không ghi lại — mỗi lần ghi là một lần bump `updated_at` + một lượt đẩy đồng bộ.
- **Gắn thủ công**: popover của thẻ → **Nhãn** mở hộp thoại
  (`review/ui/LabelDialog.tsx`, dùng `useDialog` chung): chip nhãn hiện có kèm
  nút gỡ, ô thêm nhãn với gợi ý (`<datalist>`) từ nhãn đã dùng trong kho. Thay
  đổi chỉ ghi khi bấm **Lưu**.
- **Gợi ý bằng AI**: nút *Gợi ý bằng AI* gửi từ + cách đọc + nghĩa đầu + vốn nhãn
  sẵn có qua proxy AI của app (`/api/ai/generate-vocab`, **cần đăng nhập**) và
  nhận về tối đa 4 nhãn; prompt/parse thuần ở `domain/labels.ts`
  (`buildLabelPrompt`/`parseLabelResponse`), nối dây ở `data/aiLabels.ts`. Gợi ý
  hiện thành chip *đề xuất* — người dùng bấm từng cái mới nhận, AI không tự ghi.
  Prompt nhấn tái dùng nhãn sẵn có để kho không đẻ ra hàng chục nhãn gần giống nhau.
- **Lọc**: ô **Nhãn** trên Filter Bar (Tất cả / Chưa gắn nhãn / từng nhãn kèm số
  thẻ) — chỉ liệt kê nhãn của từ đang hiện trên bản đồ. Bộ lọc chạy trong
  `buildCloud` nên ảnh PNG xuất ra khớp đúng cái đang xem. Gỡ nhãn cuối cùng
  đang được lọc thì bộ lọc tự trả về "Tất cả".
- **Gắn hàng loạt bằng AI**: nút **Gắn nhãn AI** trên Filter Bar (chỉ hiện khi đã
  đăng nhập) mở `review/ui/BulkLabelDialog.tsx` với **đúng tập từ đang được lọc**
  — Filter Bar dựng tập ấy bằng chính `buildCloud` + lọc `onlyDue` như bản đồ và
  ảnh PNG, nên ba thứ luôn khớp nhau. Chi tiết:
  - Chia lô 20 từ mỗi lượt hỏi model (`batchItems`), tối đa **100 từ/lượt chạy**;
    dư ra thì hộp thoại nói rõ còn bao nhiêu từ chưa hỏi thay vì lặng lẽ cắt.
  - Một lô hỏng (mạng chập / model trả rác) không vứt các lô đã xong: báo lỗi,
    vẫn bày kết quả thu được.
  - AI được yêu cầu trả kèm mặt chữ để khớp lại thẻ; `proposeBulkLabels` chỉ giữ
    phần **thực sự thêm được** (trừ nhãn trùng và phần vượt trần 8 nhãn/thẻ), thẻ
    không còn gì để thêm thì không hiện.
  - **Không ghi gì cho tới khi bấm "Áp dụng"**: mỗi nhãn đề xuất là một chip
    bật/tắt, mặc định bật. Ghi bằng `store.setManyEntryLabels` — một vòng ghi
    IndexedDB, MỘT lần cập nhật danh sách, một lần hẹn đồng bộ, một toast (thay
    vì hàng chục toast của `setEntryLabels` gọi trong vòng lặp).
  - Prompt/parse thuần ở `domain/bulkLabels.ts`, nối dây ở `data/aiLabels.ts`
    (`suggestLabelsForBatch`).
- **Sàng theo một nhãn định trước** (chiều ngược của mục trên, cùng hộp thoại): ô
  *Nhãn muốn sàng* trong `BulkLabelDialog` — gõ "Thuật ngữ AWS" thì AI không tự
  đặt nhãn nữa mà chỉ soát tập từ đang lọc và chọn ra những từ **thuộc nhãn đó**;
  để trống ô thì trở về chiều "AI tự đặt nhãn cho từng từ". Chi tiết:
  - Nhãn gán cho mọi từ được chọn là **nhãn người dùng gõ** (đã qua `normalizeLabel`),
    không phải chữ model trả về — người dùng đang gom một nhóm, nhãn lệch một chữ
    là thành hai nhóm khác nhau trong bộ lọc. Ô có gợi ý `<datalist>` từ vốn nhãn
    sẵn có, giới hạn 24 ký tự như mọi nhãn khác.
  - Prompt (`buildTargetLabelPrompt`) cho phép trả **danh sách rỗng** và nhắc "thà
    bỏ sót hơn gán sai"; `parseTargetLabelResponse` nhận mảng chuỗi trần, mảng
    object có mặt chữ, và bỏ những từ model kèm cờ phủ định (`match: false`).
  - Từ đó về sau đi đúng đường ống của lượt hàng loạt: chia lô, khớp mặt chữ bằng
    `proposeBulkLabels` (thẻ đã mang nhãn ấy thì không hiện), duyệt chip bật/tắt,
    ghi một lượt khi bấm **Áp dụng**. Không thấy từ nào thuộc nhãn thì báo đúng
    câu đó thay vì câu "không gợi ý được nhãn mới nào".

### 9.19 Lịch sử tra cứu (#269)

Khu **Tra cứu** trước đây trống trơn khi chưa mở từ nào (chỉ một câu "Tra một từ
ở ô bên trên"). Giờ chỗ đó kể lại lịch sử tra cứu của chính người dùng
(`dictionary/ui/SearchHome.tsx`):

- **Tra nhiều nhất** — từ nào cứ phải tra đi tra lại (đúng triết lý "một lần tra
  là tín hiệu của sự quên"). Chỉ hiện khi đã có từ được tra **từ 2 lượt trở lên**,
  kẻo nó chỉ là bản sao của mục dưới.
- **Tra gần đây** — mở lại nhanh từ vừa xem.
- Mỗi mục tối đa 8 từ, bấm chip là tra lại ngay (đi qua đúng đường tra thường,
  nên lượt đó cũng được đếm). Chỉ hiện lịch sử của **cặp ngôn ngữ đang chọn** —
  ô tìm trên header luôn tra theo cặp đó.
- **Xoá lịch sử tra cứu**: nút cuối trang, hoàn tác được bằng toast (không hộp
  xác nhận, theo DESIGN §3.6).

Ghi nhận ở đâu: `app/useLookup.ts` — mỗi lượt tra **mở ra được một từ** (bỏ qua
lượt gõ hụt và lượt lỗi mạng) ghi một dòng theo **lemma** (dạng từ điển), nên
食べた và 食べる về chung một dòng. Mở từ ở chế độ chỉ-đọc (bấm thẻ Word Cloud,
ô ở Học từ vựng, trang Chữ Hán) **không** tính.

- **Lưu ở đâu**: store IndexedDB `search_history` (v9), gộp theo
  `[user_id, term_lang, native_lang, term]` — tra lại chỉ tăng `count` và dời
  `lastAt`. Giữ tối đa 200 từ gần nhất mỗi người dùng.
- **Không phải dữ liệu học**: khác hẳn `VocabEntry.lookup_count`, ghi vào đây
  **không** tạo thẻ SRS, không đụng Word Cloud, không đồng bộ lên cloud và không
  nằm trong bản sao lưu. Nó không đụng tới quyết định mở #1 (triết lý gating) ở
  BACKLOG — chỉ là lịch sử để mở lại nhanh.
- Logic thuần (gộp lượt, xếp thứ tự, cắt trần) ở `dictionary/domain/searchHistory.ts`,
  I/O ở `dictionary/data/searchHistory.ts`.

### 9.20 Chế độ hình ảnh (#263)

Ôn bằng mắt: trình chiếu ảnh minh hoạ của các từ đang học, nhìn ảnh rồi tự nhớ
lại xem đó là từ nào. **Không SRS** — không chấm điểm, không ghi `review_log`,
không đụng `next_review`. Mở từ nút **Hình ảnh** cạnh "Nghe". Song sinh với chế
độ nghe (§9.15), chỉ khác giác quan.

- **Nguồn từ**: toàn bộ từ đang học trên bản đồ (`LEARNING` + `RELAPSED`) thuộc
  ngôn ngữ đang chọn — **không** theo hạn ôn, giống chế độ nghe. Số trên nút là
  số từ **ứng viên**, không phải số từ có ảnh (xem "Giới hạn" bên dưới).
- **Mỗi thẻ**: ảnh trần trước (tự đoán là từ gì) → hiện mặt chữ + cách đọc +
  nghĩa. Chỉnh được thời gian mỗi bước (3/5/8 giây) và bỏ hẳn bước tự nhớ bằng
  ô "Đáp án → Hiện ngay". Bấm vào ảnh là lật ra đáp án luôn (cùng idiom "tap
  lật" của phiên ôn), lật rồi thì bấm để dừng/chạy tiếp.
- **Danh sách chiếu**: xáo trộn, chạy vòng vô hạn tới khi dừng; hết vòng thì
  dựng lại từ dữ liệu mới nhất và **xáo lại**.
- **Màn chiếu** (`review/ui/ImageSession.tsx`): khung ảnh giữ chỗ cố định (ảnh
  Mazii đủ mọi tỉ lệ) và khối đáp án cao sẵn bằng lúc đầy nhất, nên lật đáp án
  không đẩy hàng nút xuống dưới ngón tay. Thêm Từ trước / Từ sau. Cài đặt nhớ ở
  `gioitu.imageMode.v1`. Giữ màn hình sáng bằng Wake Lock.
- **Ảnh lấy ở đâu**: ảnh là dữ liệu **cấp từ chỉ có ở máy chủ** (bảng
  `word_image`, do `npm run import:mazii` nạp) và về kèm ngay trong phản hồi
  `/api/dict/lookup`. Trình nhập Yomitan `.zip` và từ điển cá nhân **không** sinh
  ảnh, nên IndexedDB luôn trắng ảnh. Vì vậy chế độ này gọi thẳng nguồn máy chủ,
  **không** theo lựa chọn nguồn tra của người dùng — lựa chọn đó nói "tra nghĩa ở
  đâu", còn ảnh thì chỉ có một chỗ để lấy. Chưa có endpoint lấy theo lô nên mỗi
  từ là một lượt gọi; kết quả được đệm trong phiên (`review/data/wordImages.ts`)
  và thẻ kế được nạp trước để không khựng giữa hai thẻ.
- **Từ không có ảnh bị bỏ qua**: chỉ tra mới biết từ nào có ảnh, nên trình chiếu
  tự nhảy qua từ trắng ảnh thay vì bắt người xem nhìn ô trống. Một từ có nhiều
  ảnh thì các ảnh sau là **dự phòng** — ảnh Mazii là hotlink tới CDN ngoài nên
  chết dần, URL hỏng thì thẻ tự thử ảnh kế.
- **Giới hạn đã biết**: từ điển máy chủ mới có ảnh cho *một phần* từ vựng, và
  guest offline / máy không nối được backend thì **không có ảnh nào** — màn chiếu
  báo đúng lý do ("không gọi được máy chủ") thay vì im lặng. Dò qua 20 từ liên
  tiếp mà chưa từ nào có ảnh thì dừng lại hỏi (nút "Tìm tiếp") thay vì gọi mạng
  hàng trăm lần để cuối cùng vẫn báo "không có gì". Logic thuần (danh sách chiếu,
  các bước, chọn ảnh khớp đúng từ, mốc bỏ cuộc) ở `review/domain/imageMode.ts`.

### 9.21 Sàng bộ từ nhập ngoài

Nhập một danh sách từ có sẵn (JLPT N1, giáo trình, danh sách chép từ web) rồi
**đối chiếu với vốn từ của mình để quét phần đã biết đi** — chỉ còn lại phần
thật sự cần học. Nguồn thứ tư của trang Học từ vựng (§9.3).
(`vocabstudy/domain/wordset.ts`, `domain/wordsetMatch.ts`, `data/wordsets.ts`,
`ui/WordsetImport.tsx`, `ui/WordsetSummary.tsx`)

- **Nhập**: dán văn bản, chọn tệp `.txt/.csv/.tsv` (≤ 2 MB, ≤ 20.000 từ), hoặc
  **gói Anki `.apkg`** — xem §9.22.
  Mỗi dòng một từ; thứ tự cột *mặt chữ · cách đọc · nghĩa · ví dụ*. Trình phân
  tích khoan dung với danh sách chép về: bỏ đánh số đầu dòng, bóc 【cách đọc】
  dính trong mặt chữ, tôn trọng nháy kép trong nghĩa có dấu phẩy, bỏ dòng tiêu đề
  cột của tệp xuất từ Excel/Sheets — nhưng **đếm và báo lại** số dòng trùng / bỏ
  / bị cắt.
- **Nhiều lối viết cho người gõ tay** (`splitColumns`, `secondIsReading`,
  `CONTINUATION`):
  - Dấu ngăn: Tab, `,`, `|`, `=`, hoặc gạch ngang **có khoảng trắng hai bên**
    (`犬 - con chó`; gạch nối dính liền như "mother-in-law" thì không tính).
    Giữa `|`, `=`, `,` thì dấu **xuất hiện trước** trong dòng thắng, nên
    `食べる = ăn, uống` cắt ở `=` còn `food,thức ăn = đồ ăn` cắt ở `,` mà người
    dùng không phải học luật nào.
  - **Dòng hai cột**: ô thứ hai toàn kana → cách đọc, còn lại → nghĩa. Trước đây
    ô thứ hai luôn bị coi là cách đọc, nên `食べる, ăn` đẩy "ăn" thành furigana.
    Từ ba cột trở lên thì bố cục đã rõ, theo đúng thứ tự.
  - **Dòng bổ sung** `nghĩa:` / `ví dụ:` / `cách đọc:` (và `meaning:`, `example:`,
    `reading:`) gắn vào từ ngay phía trên — dạng dễ gõ nhất cho từ có câu ví dụ
    dài, khỏi đếm dấu phẩy.
- **Xem trước ngay khi gõ**: bảng bốn cột hiện ba dòng đầu đã phân tích. Đây là
  phản hồi quan trọng nhất của màn nhập tay — thấy "ăn" nằm ở cột Nghĩa chứ
  không phải Cách đọc rồi mới yên tâm dán nốt phần còn lại. Kèm khối gập
  "Các lối viết được nhận" viết thẳng ví dụ ra thay vì tả bằng lời.
- **Tệp mẫu tải về** (`sampleWordsetCsv`): nút "Tải tệp mẫu" sinh CSV đúng cặp
  ngôn ngữ đang chọn (ba từ mẫu là cùng một khái niệm viết bằng cả ba ngôn ngữ
  nên nghĩa **và câu ví dụ** luôn khớp mặt chữ ở cả sáu cặp — câu ví dụ ở ngôn
  ngữ nguồn, bản dịch ở ngôn ngữ đích), có BOM để Excel không vỡ chữ Việt/Nhật.
  Test round-trip cho mẫu chạy qua đúng `parseWordset` thật, nên tệp mẫu không
  thể lạc hậu so với trình phân tích.
- **Cột ví dụ** theo đúng quy ước `"câu :: bản dịch"` của Từ điển cá nhân
  (`CustomDraft.example`), nên câu chép từ bộ từ sang thẻ không phải sửa gì.
  Nghĩa và ví dụ hiện ở tooltip của ô trên lưới — không có chỗ hiện thì hai cột
  ấy là dữ liệu chết, bắt người dùng gõ vào rồi không bao giờ thấy lại.
- **Lưu ở đâu**: ba store IndexedDB **riêng** `wordsets` + `wordset_words` +
  `wordset_media` (DB v11), KHÔNG dùng `terms`/`dictionaries`. Bộ từ chỉ có mặt chữ nên nếu nằm
  trong `terms` sẽ hiện ra thành hit rỗng nghĩa khi tra; và đường nhập Từ điển
  cá nhân khử trùng với toàn bộ `terms` cùng cặp ngôn ngữ, tức nhập N1 vào đó
  thì gần như mọi từ bị coi là trùng với JMdict và bị bỏ. Dùng được cho guest,
  offline; chưa đồng bộ lên cloud (nhập lại là xong).
- **Thang khớp có độ tin cậy** (`domain/wordsetMatch.ts`): danh sách ngoài không
  viết theo cùng quy ước chính tả với vốn từ, nên khớp theo bậc — (1) mặt chữ
  trùng đúng, (2) trùng sau chuẩn hoá NFKC/bỏ ・ → **chắc**; (3) trùng qua cách
  đọc (fold katakana→hiragana), (4) khác okurigana nhưng cùng khung ≥2 kanji,
  (5) trùng sau khi chia ngược (`deinflect.candidates`) → **ngờ**. Cùng mặt chữ
  mà hai bên khai cách đọc khác nhau (辛い からい/つらい) cũng bị hạ xuống *ngờ*.
- **Chỉ bậc chắc mới được tự ẩn.** Nhóm ngờ hiện thành dòng "N từ có thể bạn đã
  biết" kèm nút *Duyệt nhóm này* (bộ lọc `uncertain`) — ẩn ngầm một từ đồng âm
  là giấu mất từ người dùng chưa hề biết mà họ không cách nào phát hiện.
- **Báo cáo đối chiếu**: "Đã thuộc N/T (P%) · đang học · cần ôn · chưa học" +
  thanh phủ, rồi lưới ô như các nguồn khác. Ô "Ẩn từ đã thuộc" **mặc định bật**;
  từ đang học / cần ôn vẫn hiện (chúng đã nằm trong hàng ôn, ẩn đi là mất dấu).
- **Hai hành động hàng loạt**, đều qua bước xác nhận có nêu số và ví dụ:
  - *Đánh dấu N từ đang hiện là đã thuộc* → `store.markKnownMany`: ghi tuần tự,
    một lần setState, một lần hẹn đồng bộ, **một** toast kèm Hoàn tác cả mẻ. Từ
    đã LEARNED sẵn thì bỏ qua (không bump `updated_at` vô cớ).
  - *Tách N từ đang hiện thành bộ riêng* → tạo một bộ mới `source: "sieve"` giữ
    `fromId` trỏ về bộ gốc. Là **ảnh chụp** một thời điểm, không tự cập nhật —
    mặc định vẫn nên dùng bộ lọc để con số độ phủ luôn sống.
- **Cờ nguồn**: entry chuyển sang LEARNED bằng đánh dấu hàng loạt được đóng dấu
  `learned_source: "sieve"` (trường optional, không index → không cần bump DB).
  Đây là kênh "tự khai đã thuộc" mạnh nhất trong app nên phải đếm riêng được nếu
  quyết định mở #2 trong BACKLOG siết lại. Các nút tự khai lẻ hiện **chưa** đóng
  dấu gì — vắng cờ không có nghĩa "đã tốt nghiệp đàng hoàng".

### 9.22 Nhập gói Anki (.apkg)

Nhập thẳng một deck Anki tải về thành bộ từ, **kèm ảnh minh hoạ và phát âm**.
Toàn bộ chạy trong trình duyệt, không tải gì lên server, khách chưa đăng nhập
dùng được. (`vocabstudy/domain/{zip,sqlite,ankiField,ankiDeck,mediaType}.ts`,
`data/{apkgFile,wordsetMedia}.ts`, `ui/{ApkgMapping,WordsetCard}.tsx`)

- **Không thêm phụ thuộc nào.** Ba lớp giải mã đều tự viết: đọc mục lục zip, đọc
  b-tree SQLite (chỉ-đọc, có trang tràn), bóc HTML/media/furigana khỏi trường thẻ.
  `jszip` (đã có sẵn trong dự án) **không** dùng được ở đây: `loadAsync` đòi cả
  tệp trong RAM, mà gói kèm media hay nặng vài trăm MB.
- **Không nạp cả tệp**: đọc mục lục ở đuôi tệp rồi `Blob.slice` đúng khúc cần,
  giải nén bằng `DecompressionStream` của trình duyệt. Đo trên gói JLPT Tango N1
  **207 MB**: dựng xong 1.852 từ hết **0,4 MB** bộ nhớ.
- **Ghép trường tự đoán, sửa được**: đoán theo tên trường (`VocabKanji`→mặt chữ,
  `VocabDef`→nghĩa, `SentKanji`+`SentViet`→ví dụ…) rồi bày dropdown cho từng vai
  trò. Đoán theo *độ chắc chắn* chứ không theo thứ tự trường, nếu không `SentViet`
  (bản dịch của CÂU) sẽ cướp mất cột nghĩa của `VocabDef` (nghĩa của TỪ). Deck lạ
  chỉ có `Front`/`Back` vẫn nhập được. Có dropdown chọn loại thẻ và lọc deck khi
  gói có nhiều.
- **Dữ liệu thẻ vốn bẩn**, trình bóc cố ý khoan dung: HTML sai chuẩn
  (`<b style=color: rgb(51, 102, 204);>`), furigana viết hai lối lẫn nhau trong
  cùng một deck (`身内[みうち]` và `<ruby><rb>父</rb><rt>ちち</rt></ruby>`), và
  ruby ghi nhiều cách đọc thay thế (`行[い<br>ゆ]き` → lấy phương án đầu, chứ gộp
  lại thành "い ゆきちがい" là một cách đọc không tồn tại).
- **Từ dạy lại được gộp**: deck đánh số hậu tố `遺産[1]`, `遺産[2]` cho từ xuất
  hiện ở nhiều bài; phép bóc ruby đưa cả hai về `遺産` rồi khử trùng. Lưới từ vựng
  mỗi từ một ô nên đó mới là đúng (bộ N1: 2.024 thẻ → 1.852 từ).
- **Media**: chỉ bóc tệp mà các dòng *giữ lại* trỏ tới, nên 44 MB phông chữ trong
  gói không bị đụng tới — không cần luật riêng, đơn giản là không ai hỏi. Ghi
  theo lô 50 tệp kèm thanh tiến độ. Kiểu MIME đoán bằng **chữ ký byte** chứ không
  bằng đuôi tệp: trong chính bộ N1, `1670892071719.jpg` thật ra là một tệp GIF.
- **Nói thật khi thiếu**: hết quota hay gói thiếu tệp thì phần chữ vẫn giữ, và
  báo rõ "chỉ lấy được N/M tệp media" thay vì lặng lẽ hiện thẻ không ảnh.
- **Thẻ của một từ** (`WordsetCard`): bấm một ô trong lưới bộ từ mở thẻ ngay
  trong luồng trang (không overlay) — câu ví dụ có ruby, bản dịch, ảnh, hai nút
  phát âm (từ và câu), và nút "Tra ở từ điển" giữ lối cũ. Không tự phát âm: đây
  là màn duyệt lưới, không phải phiên ôn. Media nạp theo từng thẻ và thu hồi
  object URL khi đóng — bộ N1 có 4.305 tệp, giữ sẵn URL cho tất cả là sập tab.
  Nguồn khác (lịch sử tra, từ điển cá nhân) không có thẻ để mở nên vẫn tra từ
  điển như cũ.
- **Chỉ đọc định dạng cũ** (`collection.anki2` / `.anki21`). Gói xuất từ Anki đời
  mới nén **zstd**, trình duyệt không giải được (`DecompressionStream` chỉ biết
  gzip/deflate). Gặp thì báo rõ việc cần làm: xuất lại và bật "Hỗ trợ Anki 2.1.50
  trở xuống".

## 10. Bản đồ chức năng → tài liệu

| Nhóm chức năng | Quy tắc nghiệp vụ | Lưu trữ |
|---|---|---|
| Tra cứu, deinflection, import | [LOGIC §3,6,7,8,9,10,11](./LOGIC.md) | [DB_SCHEMA §2,4](./DB_SCHEMA.md) |
| Word Cloud, ôn tập SRS | [LOGIC §4,5](./LOGIC.md) | [DB_SCHEMA §2.5](./DB_SCHEMA.md) |
| Đồng bộ & tài khoản | [LOGIC §12](./LOGIC.md) | [DB_SCHEMA §5,6](./DB_SCHEMA.md) |
| Theme | [LOGIC §13](./LOGIC.md) | `localStorage` |
</content>
