// Sync routes (mounted at /api/sync). Pull + push, both scoped to the
// authenticated user via the bearer token. SQL lives in syncStore.
import { Router } from "express";
import { wrap, requireAuth, AuthedRequest } from "../../core/middleware.js";
import { sinceParam } from "../../core/queryParams.js";
import * as syncStore from "./syncStore.js";

export const syncRoutes = Router();

// Pull (SPEC 2.C).
syncRoutes.get(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    res.json(await syncStore.pull(req.userId!, sinceParam(req.query.since)));
  }),
);

// Push with last-write-wins by updated_at (SPEC 2.C).
syncRoutes.post(
  "/",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const entries = (req.body?.entries ?? []) as Array<{
      term: string;
      term_lang: string;
      updated_at: number;
      [k: string]: unknown;
    }>;
    res.json(await syncStore.push(req.userId!, entries));
  }),
);
