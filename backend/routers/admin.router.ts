/**
 * backend/routers/admin.router.ts
 *
 * Admin-only endpoints.
 * Access is restricted to users with role="admin" in the database.
 */

import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getRedisClient } from "../middlewares/rateLimit";

// ---------------------------------------------------------------------------
// Admin-only procedure
// ---------------------------------------------------------------------------

const adminProcedure = protectedProcedure.use((opts) => {
  if (opts.ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acesso restrito a administradores.",
    });
  }
  return opts.next();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentYM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function redisMultiGet(keys: string[]): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const redis  = await getRedisClient();
  const values = await redis.mGet(keys);
  const map    = new Map<string, number>();
  keys.forEach((k, i) => map.set(k, parseInt(values[i] ?? "0", 10)));
  return map;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const adminRouter = router({
  /**
   * Monthly AI token usage per org (reads ai:tokens:org:{id}:{YYYY-MM} Redis keys).
   */
  aiTokenStats: adminProcedure.query(async () => {
    const ym = currentYM();
    try {
      const redis = await getRedisClient();
      const keys  = await redis.keys(`ai:tokens:org:*:${ym}`);
      const vals  = await redisMultiGet(keys);
      const entries = keys.map((key) => {
        const orgId = parseInt(key.split(":")[3] ?? "0", 10);
        return { orgId, tokens: vals.get(key) ?? 0 };
      });
      return { month: ym, entries };
    } catch {
      return { month: ym, entries: [] };
    }
  }),

  /**
   * Per-org scan count this month and force-rescan usage today.
   * Reads:
   *   scan:credits:org:{id}:{YYYY-MM}  — total scans started this month
   *   force-rescan:org:{id}:{YYYY-MM-DD} — force-rescan count today
   */
  scanCreditStats: adminProcedure.query(async () => {
    const ym    = currentYM();
    const today = new Date().toISOString().slice(0, 10);
    try {
      const redis = await getRedisClient();

      const [scanKeys, forceKeys] = await Promise.all([
        redis.keys(`scan:credits:org:*:${ym}`),
        redis.keys(`force-rescan:org:*:${today}`),
      ]);

      const [scanVals, forceVals] = await Promise.all([
        redisMultiGet(scanKeys),
        redisMultiGet(forceKeys),
      ]);

      const scanMap  = new Map<number, number>();
      const forceMap = new Map<number, number>();

      scanKeys.forEach((k) => {
        const orgId = parseInt(k.split(":")[3] ?? "0", 10);
        scanMap.set(orgId, scanVals.get(k) ?? 0);
      });
      forceKeys.forEach((k) => {
        const orgId = parseInt(k.split(":")[2] ?? "0", 10);
        forceMap.set(orgId, forceVals.get(k) ?? 0);
      });

      const orgIds = Array.from(new Set([...scanMap.keys(), ...forceMap.keys()]));
      const entries = orgIds.map((orgId) => ({
        orgId,
        scansThisMonth:   scanMap.get(orgId)  ?? 0,
        forceRescansToday: forceMap.get(orgId) ?? 0,
      }));

      return { month: ym, date: today, entries };
    } catch {
      return { month: ym, date: today, entries: [] };
    }
  }),
});
