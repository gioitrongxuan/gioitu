// Màn chào 3 bước cho lần mở đầu tiên (#152): (1) triết lý tra-là-tín-hiệu-quên
// → bấm "+", (2) tải từ điển đề xuất một chạm (zip host trên chính server),
// (3) nhịp ôn mỗi ngày ở màn Hôm nay. Bỏ qua được ở mọi bước; mọi ngả đóng
// (Bỏ qua / Bắt đầu / Escape / Back) đều đánh dấu đã xem — App lo việc đó
// trong onClose nên ở đây chỉ render và gọi.

import { useEffect, useState } from "react";
import { useDialog } from "@/shared/ui/useDialog";
import { importYomitanUrl } from "@/features/dictionary/data/yomitan";
import { fetchRecommendedDicts, RecommendedDict } from "@/features/dictionary/data/recommended";
import { LangPair } from "@/shared/languages";
import "./shell.css";

const STEP_COUNT = 3;

interface OnboardingProps {
  pair: LangPair;
  /** Bước mở đầu — extension dẫn thẳng vào bước từ điển (#251), mặc định vào từ đầu. */
  startStep?: number;
  /** Cài xong từ điển đề xuất: App chuyển nguồn tra sang "Trên máy". */
  onImported: () => void;
  onClose: () => void;
}

export function Onboarding({ pair, startStep = 0, onImported, onClose }: OnboardingProps) {
  const [step, setStep] = useState(startStep);
  // null = đang hỏi server; [] = không có gói đề xuất cho cặp này.
  const [dicts, setDicts] = useState<RecommendedDict[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  useEffect(() => {
    let cancelled = false;
    fetchRecommendedDicts(pair).then((list) => {
      if (!cancelled) setDicts(list);
    });
    return () => {
      cancelled = true;
    };
  }, [pair]);

  async function downloadRecommended(dict: RecommendedDict) {
    setBusy(true);
    setStatus(`Đang tải “${dict.name}”…`);
    try {
      const res = await importYomitanUrl(
        dict.url,
        { term_lang: dict.source, native_lang: dict.target },
        (f) => setStatus(`Đang tải “${dict.name}”… ${Math.round(f * 100)}%`),
      );
      setStatus(`Đã cài “${res.title}” (${res.termCount} mục) — tra cứu giờ chạy ngay trên máy, kể cả offline.`);
      setInstalled(true);
      onImported();
    } catch (err) {
      setStatus(`Lỗi tải: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const isLast = step === STEP_COUNT - 1;

  return (
    // Không đóng khi bấm nền: màn chào chỉ hiện đúng một lần, lỡ tay chạm ra
    // ngoài mà mất luôn thì người mới không tìm lại được. Escape/Bỏ qua vẫn đóng.
    <div className="theme-overlay">
      <div
        className="theme-card ob-card"
        role="dialog"
        aria-modal="true"
        aria-label="Bắt đầu với Gioitu"
        tabIndex={-1}
        ref={dialogRef}
      >
        {step === 0 && (
          <section>
            <h2 className="ob-title">
              Chào mừng đến <span lang="ja">語</span> Gioitu
            </h2>
            <p className="ob-lead">
              Từ điển Nhật/Anh → Việt đi kèm ôn tập ngắt quãng, xây trên một ý đơn giản:{" "}
              <strong>mỗi lần phải tra một từ là một tín hiệu bạn đang quên nó</strong>.
            </p>
            <p className="ob-lead">
              Tra từ như từ điển bình thường; gặp từ muốn nhớ lâu, bấm <strong>“+”</strong> để nhận
              thẻ ôn — app sẽ nhắc lại đúng lúc bạn sắp quên.
            </p>
          </section>
        )}

        {step === 1 && (
          <section>
            <h2 className="ob-title">Chọn nguồn từ điển</h2>
            <p className="ob-lead">
              Bạn tra được ngay bằng nguồn <strong>Server</strong>, không cần cài gì. Muốn tra nhanh
              hơn và dùng offline, tải từ điển đề xuất về máy bằng một chạm:
            </p>
            {dicts == null ? (
              <p className="ob-hint">Đang kiểm tra gói đề xuất…</p>
            ) : dicts.length === 0 ? (
              <p className="ob-hint">
                Server chưa có gói đề xuất cho cặp {pair.label}. Bạn vẫn tra ngay được bằng nguồn
                Server, hoặc tự nhập file .zip Yomitan qua nút “Từ điển” trên đầu trang.
              </p>
            ) : (
              <div className="ob-dicts">
                {dicts.map((d) => (
                  <button
                    key={d.file}
                    type="button"
                    className="primary"
                    disabled={busy || installed}
                    onClick={() => downloadRecommended(d)}
                  >
                    Tải “{d.name}”
                  </button>
                ))}
              </div>
            )}
            {status && (
              <p className="ob-status" role="status">
                {status}
              </p>
            )}
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 className="ob-title">Giữ nhịp mỗi ngày</h2>
            <p className="ob-lead">
              Mở app là màn <strong>Hôm nay</strong>: ôn đúng những từ đến hạn (vài phút thôi) và
              giữ chuỗi ngày liên tục. Những từ hay quên nhất sẽ tự nổi lên ở đó.
            </p>
            <p className="ob-lead">
              Toàn bộ từ đã lưu nằm trong <strong>Kho từ</strong> — một bản đồ trí nhớ: từ càng mờ
              là càng lâu chưa gặp lại.
            </p>
          </section>
        )}

        <footer className="ob-foot">
          <div className="ob-dots" aria-label={`Bước ${step + 1} trên ${STEP_COUNT}`}>
            {Array.from({ length: STEP_COUNT }, (_, i) => (
              <span key={i} className={i === step ? "ob-dot active" : "ob-dot"} />
            ))}
          </div>
          <div className="ob-actions">
            {!isLast && (
              <button type="button" className="link" onClick={onClose}>
                Bỏ qua
              </button>
            )}
            <button
              type="button"
              className="primary"
              onClick={() => (isLast ? onClose() : setStep(step + 1))}
            >
              {isLast ? "Bắt đầu" : "Tiếp tục"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
