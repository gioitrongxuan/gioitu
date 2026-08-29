// Thẻ của MỘT từ trong bộ nhập từ gói Anki: câu ví dụ có ruby, bản dịch, ảnh
// minh hoạ và hai nút phát âm — dựng lại đúng thứ thẻ Anki gốc đã bày.
//
// Nằm thẳng trong luồng trang, KHÔNG phải overlay. Đó là lập trường sẵn có của
// feature này (xem đầu `WordsetImport.tsx`): không overlay thì không phải bẫy
// focus, không phải quản lý lớp chồng, và người dùng vẫn thấy lưới ngay bên dưới
// nên biết mình đang ở đâu trong bộ.
//
// Media nạp theo yêu cầu: bộ N1 có gần 5000 tệp, giữ sẵn URL cho tất cả thì tab
// sập. Mở thẻ nào nạp thẻ ấy, đóng thì trả lại ngay.

import { useEffect, useState } from "react";
import { WordsetWord } from "@/shared/db";
import { Furigana, FuriganaSegments } from "@/shared/ui/Furigana";
import { CloseIcon, SearchIcon, SpeakerIcon } from "@/shared/ui/icons";
import { parseAnkiFurigana } from "../domain/ankiField";
import { splitExample } from "../domain/wordset";
import { getWordsetMedia } from "../data/wordsetMedia";

export function WordsetCard({
  setId,
  row,
  term,
  reading,
  isJa,
  onLookup,
  onClose,
}: {
  setId: string;
  /** Dòng gốc trong bộ. Vắng khi từ này không có trong bộ (không nên xảy ra). */
  row: WordsetWord | undefined;
  term: string;
  reading?: string;
  isJa: boolean;
  onLookup: () => void;
  onClose: () => void;
}) {
  const image = useMediaUrl(setId, row?.imageName);
  const audio = useMediaUrl(setId, row?.audioName);
  const exampleAudio = useMediaUrl(setId, row?.exampleAudioName);

  const example = row?.example ? splitExample(row.example) : null;
  // Có ruby thì dựng từ ruby; không thì bày câu trơn. Không tự đoán furigana cho
  // cả câu: `distributeFurigana` căn một cặp (mặt chữ, cách đọc) của MỘT từ, đem
  // rải lên nguyên câu là ra ruby bịa.
  const segments = row?.exampleFurigana ? parseAnkiFurigana(row.exampleFurigana) : null;

  return (
    <section className="wordset-card" aria-label={`Thẻ của từ ${term}`}>
      <div className="wordset-card-head">
        <h3 className="wordset-card-term">
          {isJa ? <Furigana term={term} reading={reading} /> : term}
        </h3>
        {audio && <PlayButton src={audio} label={`Nghe phát âm của ${term}`} />}
        <button className="link icon-label wordset-card-close" aria-label="Đóng thẻ" onClick={onClose}>
          <CloseIcon size={16} />
        </button>
      </div>

      {row?.gloss && <p className="wordset-card-gloss">{row.gloss}</p>}

      {example && (
        <div className="wordset-card-example">
          <p lang={isJa ? "ja" : undefined}>
            {segments ? <FuriganaSegments segments={segments} lang={isJa ? "ja" : undefined} /> : example.sentence}
            {exampleAudio && <PlayButton src={exampleAudio} label="Nghe câu ví dụ" />}
          </p>
          {example.translation && <p className="muted">{example.translation}</p>}
        </div>
      )}

      {image && <img className="wordset-card-image" src={image} alt={`Ảnh minh hoạ cho ${term}`} loading="lazy" />}

      <div className="wordset-card-actions">
        <button className="export-btn" onClick={onLookup}>
          <SearchIcon size={16} />
          Tra ở từ điển
        </button>
      </div>
    </section>
  );
}

/** Nút phát một tệp âm thanh. Không tự phát: đây là màn duyệt lưới, không phải
 *  phiên ôn — tự dưng phát tiếng giữa văn phòng là phiền. */
function PlayButton({ src, label }: { src: string; label: string }) {
  return (
    <button
      className="link icon-label wordset-card-play"
      aria-label={label}
      title={label}
      onClick={() => void new Audio(src).play().catch((e) => console.warn("phát âm thất bại", e))}
    >
      <SpeakerIcon size={16} />
    </button>
  );
}

/**
 * URL tạm của một tệp media trong bộ. `null` khi từ không có tệp ấy, hoặc lần
 * nhập trước không lấy được nó.
 *
 * Thu hồi URL ở bước dọn dẹp là bắt buộc, không phải cho gọn: mỗi `createObjectURL`
 * ghim cả blob trong bộ nhớ tới khi tab đóng. Lướt qua vài trăm thẻ mà không thu
 * hồi là giữ luôn vài trăm MB ảnh và tiếng.
 */
function useMediaUrl(setId: string, name: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!name) {
      setUrl(null);
      return;
    }
    let revoked = false;
    let current: string | null = null;
    void getWordsetMedia(setId, name)
      .then((blob) => {
        // Đổi từ trước khi đọc xong: bỏ kết quả cũ, đừng để nó ghi đè thẻ đang mở.
        if (!blob || revoked) return;
        current = URL.createObjectURL(blob);
        setUrl(current);
      })
      .catch((e) => console.warn("không đọc được media của bộ từ", e));

    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
      setUrl(null);
    };
  }, [setId, name]);

  return url;
}
