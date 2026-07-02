// Headword furigana dùng chung: <ruby> chuẩn HTML trên từng cụm kanji, reading
// căn theo distributeFurigana (port thuật toán của Yomitan) nên đồng âm ghép
// đúng cụm thay vì trải đều. Một component duy nhất cho panel chi tiết, thẻ ôn
// tập và mọi chỗ hiển thị từ đã lưu — một chỗ để chỉnh kiểu chữ Nhật.

import { Fragment } from "react";
import { distributeFurigana } from "@/shared/japanese";

interface Props {
  term: string;
  reading?: string;
  /** Ngôn ngữ của headword — chọn font qua :lang() trong CSS. Mặc định "ja". */
  lang?: string;
}

export function Furigana({ term, reading, lang = "ja" }: Props) {
  const segments = distributeFurigana(term, reading);
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
