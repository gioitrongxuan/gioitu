// Đồng bộ từ điển cá nhân (mounted /api/dict-sync). Pull + push, gác bằng
// requireAuth + canSyncDicts (Premium). Đối xứng với /api/sync (user_data) nhưng
// đơn vị là cả một từ điển (blob nén). SQL/nén ở dictSyncStore.
import { Router } from "express";
import { wrap, requireAuth, AuthedRequest } from "../../core/middleware.js";
import { canSyncDicts } from "../../core/entitlements.js";
import * as dictSyncStore from "./dictSyncStore.js";

export const dictSyncRoutes = Router();

const NEED_PREMIUM = "Cần Premium để đồng bộ từ điển cá nhân";

dictSyncRoutes.get(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    if (!(await canSyncDicts(req.userId!))) return res.status(403).json({ error: NEED_PREMIUM });
    const since = Number(req.query.since ?? 0);
    res.json(await dictSyncStore.pull(req.userId!, since));
  }),
);

dictSyncRoutes.post(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    if (!(await canSyncDicts(req.userId!))) return res.status(403).json({ error: NEED_PREMIUM });
    const dicts = (req.body?.dicts ?? []) as dictSyncStore.SyncedDict[];
    const result = await dictSyncStore.push(req.userId!, dicts);
    if (!result.ok) return res.status(413).json({ error: "Vượt hạn mức lưu trữ từ điển cá nhân" });
    res.json(result.dicts);
  }),
);
