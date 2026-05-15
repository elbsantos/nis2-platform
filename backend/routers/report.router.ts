/**
 * server/routers/report.router.ts
 *
 * tRPC router for PDF report generation.
 * Returns PDF as base64 so the frontend can trigger a browser download
 * without requiring S3/object storage to be configured.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { freeProcedure } from "../middlewares/planGuard";
import { getScanById } from "../db";

export const reportRouter = router({
  /**
   * Generate an executive or technical PDF report for a completed scan.
   * Returns the PDF as a base64-encoded string.
   */
  generate: freeProcedure
    .input(
      z.object({
        scanId: z.number().int().positive(),
        type: z.enum(["executive", "technical"]),
      })
    )
    .query(async ({ ctx, input }) => {
      const scan = await getScanById(input.scanId);
      if (!scan) throw new TRPCError({ code: "NOT_FOUND", message: "Scan não encontrado" });
      if (scan.organizationId !== ctx.org.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para aceder a este scan" });
      }
      if (scan.status !== "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O scan ainda não está concluído" });
      }

      const { generateReportBuffer } = await import("../services/pdf-report-generator");
      const buffer = await generateReportBuffer({
        scanId: input.scanId,
        organizationId: ctx.org.id,
        type: input.type,
      });

      const filename = `nis2-${input.type}-scan${input.scanId}.pdf`;
      return { pdfBase64: buffer.toString("base64"), filename };
    }),
});
