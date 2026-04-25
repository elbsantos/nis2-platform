/**
 * server/routers/remediation.router.ts
 *
 * tRPC router for AI-generated remediation plans.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { freeProcedure, proProcedure } from "../middlewares/planGuard";
import {
  getRemediationItemsByOrgId,
  updateRemediationStatus,
  getScanById,
} from "../db";
import { generateRemediationForScan } from "../services/ai-remediation";

export const remediationRouter = router({
  /**
   * List remediation items for the org, optionally filtered by status
   */
  list: freeProcedure
    .input(
      z.object({
        status: z.enum(["todo", "in_progress", "done", "wont_fix"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getRemediationItemsByOrgId(ctx.org.id, input.status);
    }),

  /**
   * Generate AI remediation plans for all vulnerabilities in a scan (pro/mssp)
   */
  generate: proProcedure
    .input(z.object({ scanId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const scan = await getScanById(input.scanId);
      if (!scan) throw new TRPCError({ code: "NOT_FOUND" });
      if (scan.organizationId !== ctx.org.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (scan.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "O scan ainda não está concluído",
        });
      }

      const count = await generateRemediationForScan(input.scanId, ctx.org.id);
      return { generated: count };
    }),

  /**
   * Update the status of a remediation item
   */
  updateStatus: freeProcedure
    .input(
      z.object({
        itemId: z.number().int().positive(),
        status: z.enum(["todo", "in_progress", "done", "wont_fix"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateRemediationStatus(input.itemId, ctx.org.id, input.status);
      return { ok: true };
    }),
});
