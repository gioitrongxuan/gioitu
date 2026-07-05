// Optional backend entry point (SPEC 2). The frontend works without it
// (IndexedDB-only); when present it provides a fallback dictionary, account
// auth and cloud sync. This file only bootstraps: init the schema, seed, then
// assemble the app (see app.ts) and listen.
import { runMigrations } from "./core/migrate.js";
import { seedIfEmpty } from "./core/seed.js";
import { createApp } from "./app.js";
import { sweep as sweepShares, SHARE_TTL_MS } from "./features/share/shareStore.js";

await runMigrations();
await seedIfEmpty();

const app = createApp();
const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => console.log(`gioitu backend on http://localhost:${PORT}`));

// Dọn link chia sẻ hết hạn định kỳ (mỗi phút) — bổ trợ cho xoá lười khi truy cập.
setInterval(() => void sweepShares().catch(() => undefined), Math.min(SHARE_TTL_MS, 60_000));
