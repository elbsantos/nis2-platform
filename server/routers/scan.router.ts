/**
 * server/routers/scan.router.ts
 *
 * tRPC router for NIS2 scan operations.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { freeProcedure, proProcedure } from "../middlewares/planGuard";
import { executeAgentlessScan, verifyDomainOwnership } from "../services/scan-executor";
import { createScan, getScanById, getScansByOrgId } from "../db";
import { checkScanLimit } from "../middlewares/planGuard";
import { isSafeTarget } from "../middlewares/security";

// Zod refinement: reject private/internal targets before any DNS or API call
const safeTarget = z.string().min(1).refine(isSafeTarget, {
  message: "Target inválido: apenas domínios públicos são permitidos.",
});

export const scanRouter = {
  /**
   * Verify domain ownership before allowing scan
   */
  verifyOwnership: freeProcedure
    .input(z.object({ domain: safeTarget }))
    .query(async ({ ctx, input }) => {
      const result = await verifyDomainOwnership(input.domain, ctx.org.id);
      return {
        verified: result.verified,
        method: result.method,
        token: `nis2pt-verify=${ctx.org.id}`,
      };
    }),

  /**
   * Start a new scan (free tier: 1/month, pro/mssp: unlimited)
   */
  start: freeProcedure
    .input(
      z.object({
        target: safeTarget,
        mode: z.enum(["sme", "supply"]).default("sme"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check scan limit
      const limitCheck = await checkScanLimit(ctx.org.id, ctx.plan);
      if (!limitCheck.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: limitCheck.reason ?? "Scan limit reached",
        });
      }

      // Verify ownership
      const ownership = await verifyDomainOwnership(input.target, ctx.org.id);
      if (!ownership.verified) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Verificação de ownership falhou. Adiciona este DNS TXT ao domínio: nis2pt-verify=${ctx.org.id}`,
        });
      }

      // Create scan record
      const scan = await createScan({
        organizationId: ctx.org.id,
        target: input.target,
        mode: input.mode,
        status: "pending",
      });

      // Start scan async (non-blocking)
      executeAgentlessScan({
        scanId: scan.id,
        organizationId: ctx.org.id,
        target: input.target,
        mode: input.mode,
      }).catch((err) => {
        console.error(`[Scan ${scan.id}] Async execution error:`, err);
      });

      return { scanId: scan.id, status: "started" };
    }),

  /**
   * Get scan results by ID
   */
  getById: freeProcedure
    .input(z.object({ scanId: z.number() }))
    .query(async ({ ctx, input }) => {
      const scan = await getScanById(input.scanId);

      if (!scan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan não encontrado" });
      }

      if (scan.organizationId !== ctx.org.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Sem permissão para aceder a este scan",
        });
      }

      return scan;
    }),

  /**
   * List all scans for the org
   */
  list: freeProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(50).default(10),
          offset: z.number().min(0).default(0),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const scans = await getScansByOrgId(
        ctx.org.id,
        input?.limit ?? 10,
        input?.offset ?? 0
      );
      return scans;
    }),

  /**
   * Get scan statistics (Pro only)
   */
  stats: proProcedure.query(async ({ ctx }) => {
    const { getOrgScanStats } = await import("../db");
    return getOrgScanStats(ctx.org.id);
  }),
};
