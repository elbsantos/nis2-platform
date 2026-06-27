/**
 * server/middlewares/planGuard.ts
 *
 * tRPC middleware that enforces plan-based feature access.
 *
 * Usage in routers:
 *   import { planProcedure } from "../middlewares/planGuard";
 *
 *   // Only Pro or MSSP can access this route
 *   someRouter.someRoute: planProcedure("pro").query(...)
 *
 *   // Only MSSP can access this route
 *   someRouter.mssp: planProcedure("mssp").query(...)
 */

import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../_core/trpc";
import { getSubscriptionByOrgId } from "../db";
import type { Plan } from "../integrations/stripe";

// ---------------------------------------------------------------------------
// Plan hierarchy — higher index = more access
// ---------------------------------------------------------------------------

const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  pro: 1,
  mssp: 2,
  enterprise: 3,
};

// ---------------------------------------------------------------------------
// Get org plan — cached per request via tRPC context
// Falls back to "free" if no subscription found
// ---------------------------------------------------------------------------

async function getOrgPlan(orgId: number): Promise<Plan> {
  try {
    const sub = await getSubscriptionByOrgId(orgId);
    if (!sub) return "free";

    // Check if subscription is still active
    if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < new Date()) {
      return "free"; // expired
    }

    return (sub.plan as Plan) ?? "free";
  } catch {
    return "free"; // fail-safe: never grant higher access on error
  }
}

// ---------------------------------------------------------------------------
// planProcedure — factory that returns a tRPC procedure requiring minimum plan
// ---------------------------------------------------------------------------

export function planProcedure(minimumPlan: Plan) {
  return protectedProcedure.use(async (opts) => {
    const { ctx, next } = opts;

    // Self-heal: cria org se não existir (ADR-002 — lazy creation)
    const { getOrCreateOrgForOwner } = await import("../db");
    const org = await getOrCreateOrgForOwner(ctx.user.id, ctx.user.name ?? undefined);

    const currentPlan = await getOrgPlan(org.id);
    const hasAccess = PLAN_RANK[currentPlan] >= PLAN_RANK[minimumPlan];

    if (!hasAccess) {
      const upgradeMessage: Record<Plan, string> = {
        free: "", // never triggered (free is minimum)
        pro: "Esta funcionalidade requer o plano Pro (€89/mês + IVA). Faz upgrade na tua dashboard.",
        mssp: "Esta funcionalidade é exclusiva do plano MSSP (€199/mês + IVA). Contacta-nos para saber mais.",
        enterprise: "Esta funcionalidade é exclusiva do plano Enterprise. Contacta hello@nis2pt.pt para saber mais.",
      };

      throw new TRPCError({
        code: "FORBIDDEN",
        message: upgradeMessage[minimumPlan],
        cause: { requiredPlan: minimumPlan, currentPlan },
      });
    }

    return next({
      ctx: {
        ...ctx,
        org,
        plan: currentPlan,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Convenience exports
// ---------------------------------------------------------------------------

/** Any authenticated user (free, pro, mssp) — same as protectedProcedure but adds org + plan to ctx */
export const freeProcedure = planProcedure("free");

/** Pro or MSSP only */
export const proProcedure = planProcedure("pro");

/** MSSP only */
export const msspProcedure = planProcedure("mssp");

/** Enterprise only */
export const enterpriseProcedure = planProcedure("enterprise");

// ---------------------------------------------------------------------------
// Helper: check if org is at scan limit (free tier: 1 scan/month)
// ---------------------------------------------------------------------------

export async function checkScanLimit(
  orgId: number,
  plan: Plan
): Promise<{ allowed: boolean; reason?: string }> {
  if (plan !== "free") return { allowed: true };

  const { countScansThisMonth } = await import("../db");
  const count = await countScansThisMonth(orgId);

  if (count >= 1) {
    return {
      allowed: false,
      reason:
        "O plano gratuito permite 1 scan por mês. Faz upgrade para o plano Pro para scans ilimitados.",
    };
  }

  return { allowed: true };
}
