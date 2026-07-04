// Bảng viết tay (port ref/jisho-open DrawingPad sang React, dùng Pointer Events
// để gộp chuột + cảm ứng). Vẽ nét lên canvas, chuẩn hoá toạ độ về [0, 1] rồi gửi
// server nhận dạng (data/handwritingApi). Sau khi nhấc bút một nhịp mới truy vấn
// (debounce) để không gọi liên tục giữa các nét. Bấm ứng viên → chèn vào ô tìm.

import { useEffect, useRef, useState } from "react";
import { recognizeHandwriting, Stroke } from "../data/handwritingApi";

interface Props {
  /** Chèn ký tự đã chọn vào ô tìm kiếm. */
  onInsert: (char: string) => void;
}

interface Point {
  x: number;
  y: number;
  t: number;
}

const QUERY_DELAY_MS = 500;
const CANDIDATE_SLOTS = 5;

export function HandwritingPad({ onInsert }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const drawingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const epochRef = useRef(0);
  const [results, setResults] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [empty, setEmpty] = useState(true);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = getComputedStyle(canvas).color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = (w / 160) * 4;
    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * w, stroke[0].y * h);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x * w, stroke[i].y * h);
      ctx.stroke();
    }
  }

  function query() {
    window.clearTimeout(timerRef.current);
    const strokes = strokesRef.current;
    if (strokes.length === 0) {
      setResults([]);
      return;
    }
    timerRef.current = window.setTimeout(async () => {
      const epoch = ++epochRef.current;
      const payload: Stroke[] = strokes.map((s) => [s.map((p) => p.x), s.map((p) => p.y), s.map((p) => p.t)]);
      setWorking(true);
      try {
        const candidates = await recognizeHandwriting(payload);
        if (epoch === epochRef.current) setResults(candidates);
      } finally {
        if (epoch === epochRef.current) setWorking(false);
      }
    }, QUERY_DELAY_MS);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw();

    const posOf = (ev: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      const now = performance.now();
      if (startTimeRef.current === null) startTimeRef.current = now;
      return {
        x: (ev.clientX - rect.left) / rect.width,
        y: (ev.clientY - rect.top) / rect.height,
        t: Math.round(now - startTimeRef.current),
      };
    };

    const onDown = (ev: PointerEvent) => {
      ev.preventDefault();
      window.clearTimeout(timerRef.current);
      drawingRef.current = true;
      canvas.setPointerCapture(ev.pointerId);
      strokesRef.current.push([posOf(ev)]);
      setEmpty(false);
      draw();
    };
    const onMove = (ev: PointerEvent) => {
      if (!drawingRef.current) return;
      ev.preventDefault();
      strokesRef.current[strokesRef.current.length - 1].push(posOf(ev));
      draw();
    };
    const onUp = (ev: PointerEvent) => {
      if (!drawingRef.current) return;
      ev.preventDefault();
      drawingRef.current = false;
      query();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timerRef.current);
    };
    // Gắn một lần khi mount — canvas không đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clear() {
    window.clearTimeout(timerRef.current);
    epochRef.current++;
    strokesRef.current = [];
    startTimeRef.current = null;
    setResults([]);
    setWorking(false);
    setEmpty(true);
    draw();
  }

  return (
    <div className="handwriting-pad">
      <div className="handwriting-canvas-wrap">
        <canvas ref={canvasRef} className="handwriting-canvas" aria-label="Vùng viết tay" />
        {empty && <span className="handwriting-hint">Viết vào đây</span>}
      </div>
      <div className="handwriting-side">
        <button type="button" className="hw-clear" onClick={clear} aria-label="Xoá nét vẽ">
          ✕
        </button>
        {Array.from({ length: CANDIDATE_SLOTS }, (_, i) => {
          const char = results[i];
          return (
            <button
              key={i}
              type="button"
              className="hw-candidate"
              lang="ja"
              disabled={!char}
              onClick={() => char && onInsert(char)}
            >
              {char ?? (working && i === 0 ? "…" : "")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
