// Tab B — sinh từ vựng bằng AI (Issue #69). Hai đường, cùng đổ vào một trình
// phân tích (parseAiResponse) rồi thêm dòng vào lưới:
//   • "Lấy Prompt" : dựng prompt (buildAiPrompt) và copy — người dùng tự chạy
//     ChatGPT/Gemini rồi dán kết quả vào ô dưới, bấm "Phân tích".
//   • "Generate"   : gửi thẳng prompt tới máy chủ (Deepseek). Cần đăng nhập.

import { useState } from "react";
import { LangPair } from "@/shared/languages";
import { CustomDraft, buildAiPrompt, parseAiResponse } from "../../domain/customEntry";
import { generateVocab } from "../../data/aiGenerate";

export function AiPanel({
  pair,
  dictTitle,
  topic,
  description,
  loggedIn,
  onRequestLogin,
  onAddRows,
}: {
  pair: LangPair;
  /** Metadata của bộ từ đang soạn — đưa vào prompt làm ngữ cảnh (tuỳ chọn). */
  dictTitle?: string;
  topic?: string;
  description?: string;
  loggedIn: boolean;
  onRequestLogin: () => void;
  onAddRows: (rows: CustomDraft[]) => void;
}) {
  const [wantExamples, setWantExamples] = useState(true);
  const [wantExplanation, setWantExplanation] = useState(true);
  const [wantRelated, setWantRelated] = useState(true);
  const [wordList, setWordList] = useState("");
  const [randomCount, setRandomCount] = useState(0);
  const [extra, setExtra] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [promptFallback, setPromptFallback] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const buildPrompt = () =>
    buildAiPrompt({
      words: wordList.split("\n").map((w) => w.trim()).filter(Boolean),
      randomCount: Math.max(0, Math.floor(randomCount) || 0),
      wantExamples,
      wantExplanation,
      wantRelated,
      extra,
      pair,
      dictTitle,
      topic,
      description,
    });

  /** Đưa kết quả đã phân tích vào lưới, báo số dòng thêm được + lỗi (nếu có). */
  function applyParsed(text: string) {
    const { rows, errors } = parseAiResponse(text);
    if (rows.length) onAddRows(rows);
    const parts: string[] = [];
    if (rows.length) parts.push(`Đã thêm ${rows.length} dòng vào lưới.`);
    if (errors.length) parts.push(errors.join(" "));
    if (!rows.length && !errors.length) parts.push("Không có dòng nào.");
    setStatus(parts.join(" "));
  }

  async function onGetPrompt() {
    const prompt = buildPrompt();
    setStatus("");
    setPromptFallback("");
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus("Đã copy prompt vào clipboard. Dán vào ChatGPT/Gemini, rồi dán kết quả JSON xuống dưới.");
    } catch {
      // Clipboard bị chặn (không phải HTTPS…) — hiện prompt để copy tay.
      setPromptFallback(prompt);
      setStatus("Không copy tự động được — hãy copy prompt bên dưới.");
    }
  }

  async function onGenerate() {
    setBusy(true);
    setStatus("Đang sinh từ vựng…");
    try {
      const content = await generateVocab(buildPrompt());
      applyParsed(content);
    } catch (err) {
      setStatus((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-panel">
      <div className="ai-checks">
        <label className="chk">
          <input type="checkbox" checked={wantExamples} onChange={(e) => setWantExamples(e.target.checked)} />
          Kèm câu ví dụ
        </label>
        <label className="chk">
          <input type="checkbox" checked={wantExplanation} onChange={(e) => setWantExplanation(e.target.checked)} />
          Kèm giải thích
        </label>
        <label className="chk">
          <input type="checkbox" checked={wantRelated} onChange={(e) => setWantRelated(e.target.checked)} />
          Kèm từ liên quan / dễ nhầm
        </label>
      </div>

      <label className="form-field">
        <span className="field-label">Danh sách từ (mỗi dòng một từ)</span>
        <textarea
          rows={4}
          lang={pair.source === "ja" ? "ja" : undefined}
          value={wordList}
          onChange={(e) => setWordList(e.target.value)}
          placeholder={"猫\n犬\n鳥"}
        />
      </label>

      <div className="form-row">
        <label className="form-field">
          <span className="field-label">Số từ ngẫu nhiên thêm</span>
          <input
            type="number"
            min={0}
            value={randomCount}
            onChange={(e) => setRandomCount(Math.max(0, Math.floor(Number(e.target.value)) || 0))}
          />
        </label>
        <label className="form-field grow">
          <span className="field-label">Yêu cầu thêm</span>
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="vd: chủ đề nấu ăn, mức N3" />
        </label>
      </div>

      <div className="ai-actions">
        <button type="button" className="link" disabled={busy} onClick={onGetPrompt}>
          Lấy Prompt
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy || !loggedIn}
          title={loggedIn ? "Gọi AI trên máy chủ" : "Cần đăng nhập để dùng Generate"}
          onClick={onGenerate}
        >
          {busy ? "Đang sinh…" : "Generate"}
        </button>
        {!loggedIn && (
          <span className="muted">
            Generate cần{" "}
            <button type="button" className="link" onClick={onRequestLogin}>
              đăng nhập
            </button>
            ; hoặc dùng “Lấy Prompt”.
          </span>
        )}
      </div>

      {promptFallback && (
        <textarea className="prompt-fallback" rows={6} readOnly value={promptFallback} onFocus={(e) => e.target.select()} />
      )}

      <label className="form-field">
        <span className="field-label">Dán kết quả AI (JSON) rồi bấm Phân tích</span>
        <textarea rows={5} value={aiResponse} onChange={(e) => setAiResponse(e.target.value)} placeholder='{ "words": [ … ] }' />
      </label>
      <button type="button" className="primary" disabled={!aiResponse.trim()} onClick={() => applyParsed(aiResponse)}>
        Phân tích & thêm vào lưới
      </button>

      {status && <p className="dict-status">{status}</p>}
    </div>
  );
}
