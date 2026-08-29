// Headword furigana dùng chung: <ruby> chuẩn HTML trên từng cụm kanji, reading
// căn theo distributeFurigana (port thuật toán của Yomitan) nên đồng âm ghép
// đúng cụm thay vì trải đều. Một component duy nhất cho panel chi tiết, thẻ ôn
// tập và mọi chỗ hiển thị từ đã lưu — một chỗ để chỉnh kiểu chữ Nhật.

import { Fragment } from "react";
import { distributeFurigana, FuriganaSegment } from "@/shared/japanese";

interface Props {
  term: string;
  reading?: string;
  /** Ngôn ngữ của headword — chọn font qua :lang() trong CSS. Mặc định "ja". */
  lang?: string;
}

export function Furigana({ term, reading, lang = "ja" }: Props) {
  return <FuriganaSegments segments={distributeFurigana(term, reading)} lang={lang} />;
}

/**
 * Dựng ruby từ các đoạn ĐÃ chia sẵn.
 *
 * Tách khỏi `Furigana` vì không phải nguồn nào cũng chia được bằng
 * `distributeFurigana`: câu ví dụ nhập từ gói Anki đã mang sẵn ruby cho từng cụm
 * (`身内[みうち]に…`), chia lại từ cặp (mặt chữ, cách đọc) là vừa thừa vừa sai.
 * Một chỗ dựng `<ruby>` cho cả hai đường.
 */
export function FuriganaSegments({ segments, lang = "ja" }: { segments: FuriganaSegment[]; lang?: string }) {
  return (
    <span className="furigana" lang={lang}>
      {segments.map((seg, i) =>
        seg.reading ? (
          <ruby key={i}>
            {seg.text}
            <rt>{seg.reading}</rt>
          </ruby>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </span>
  );
}
