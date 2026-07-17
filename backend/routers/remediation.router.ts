/**
 * server/routers/remediation.router.ts
 *
 * tRPC router for AI-generated remediation plans.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { freeProcedure } from "../middlewares/planGuard";
import {
  getRemediationItemsWithScanInfo,
  updateRemediationStatus,
  getScanById,
  getRemediationItemsByScanId,
} from "../db";
import {
  generateRemediationForScan,
  countEligibleVulns,
} from "../services/ai-remediation";

export const remediationRouter = router({
  /**
   * List remediation items for the org, optionally filtered by status
   */
  list: freeProcedure
    .input(
      z.object({
        status: z.enum(["todo", "in_progress", "done", "wont_fix"]).optional(),
        scanId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getRemediationItemsWithScanInfo(ctx.org.id, {
        status: input.status,
        scanId: input.scanId,
      });
    }),

  /**
   * Start background generation of AI remediation plans for a scan.
   * Returns immediately with eligible/existing counts for UI progress polling.
   */
  generate: freeProcedure
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

      const [existingItems, eligible] = await Promise.all([
        getRemediationItemsByScanId(input.scanId),
        countEligibleVulns(input.scanId),
      ]);

      // Fire-and-forget — Railway keeps the process alive after HTTP response
      void generateRemediationForScan(input.scanId, ctx.org.id, ctx.plan).catch(
        (err) => console.error("[remediation.generate] background error:", err)
      );

      return { started: true, eligible, existing: existingItems.length };
    }),

  /**
   * Poll progress of background generation for a scan.
   * Returns done (items created so far) and eligible (total filteredVulns).
   */
  progress: freeProcedure
    .input(z.object({ scanId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const scan = await getScanById(input.scanId);
      if (!scan) throw new TRPCError({ code: "NOT_FOUND" });
      if (scan.organizationId !== ctx.org.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [items, eligible] = await Promise.all([
        getRemediationItemsByScanId(input.scanId),
        countEligibleVulns(input.scanId),
      ]);
      return { done: items.length, eligible };
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
