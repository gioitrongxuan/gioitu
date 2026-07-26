// Từ điển đề xuất cho onboarding (#152): admin thả file .zip Yomitan cùng một
// manifest.json vào thư mục GIOITU_DICTS_DIR (mặc định <cwd>/dicts) là client
// tải một chạm qua chính origin của app — không vướng CORS như link ngoài.
// manifest.json là mảng: [{ "file": "jmdict-vi.zip", "name": "JMdict JA→VI",
// "description": "…", "source": "ja", "target": "vi" }].
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Router } from "express";
import { wrap } from "../../core/middleware.js";

export const recommendedRoutes = Router();

const dictsDir = resolve(process.env.GIOITU_DICTS_DIR ?? join(process.cwd(), "dicts"));

interface ManifestEntry {
  file: string;
  name: string;
  description?: string;
  source: string;
  target: string;
}

// Đọc lại mỗi request (file bé, đổi nội dung không cần restart server); thiếu
// hoặc hỏng thì coi như chưa cấu hình — trả [] để client tự ẩn nút tải.
async function readManifest(): Promise<ManifestEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(join(dictsDir, "manifest.json"), "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: ManifestEntry) => typeof e?.file === "string" && typeof e?.name === "string",
    );
  } catch {
    return [];
  }
}

recommendedRoutes.get(
  "/",
  wrap(async (req, res) => {
    const source = req.query.source ? String(req.query.source) : null;
    const target = req.query.target ? String(req.query.target) : null;
    const list = (await readManifest())
      .filter((e) => (!source || e.source === source) && (!target || e.target === target))
      .map((e) => ({ ...e, url: `/api/dict/recommended/${encodeURIComponent(e.file)}` }));
    res.json(list);
  }),
);

recommendedRoutes.get(
  "/:file",
  wrap(async (req, res) => {
    // Chỉ phát file có tên trong manifest — chặn đọc tuỳ tiện ngoài thư mục.
    const entry = (await readManifest()).find((e) => e.file === req.params.file);
    if (!entry) return res.status(404).json({ error: "Không có từ điển đề xuất này" });
    res.sendFile(entry.file, { root: dictsDir, headers: { "Content-Type": "application/zip" } });
  }),
);
