/**
 * backend/routers/documents.router.ts
 *
 * tRPC router para geração de documentos NIS2 auto-preenchidos.
 * Devolve cada ficheiro como base64 (mesmo padrão do report router).
 *
 * Endpoints:
 *   documents.registoRiscos    — registo-riscos.xlsx    (por scan)
 *   documents.inventarioAtivos — inventario-ativos.xlsx (por scan)
 *   documents.psi              — psi-template.docx      (por org)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { freeProcedure } from "../middlewares/planGuard";
import { getScanById } from "../db";
import { CONTENT_TYPES } from "../services/document-generator";

function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "empresa"
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const documentsRouter = router({
  registoRiscos: freeProcedure
    .input(z.object({ scanId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const scan = await getScanById(input.scanId);
      if (!scan)
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan não encontrado" });
      if (scan.organizationId !== ctx.org.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      if (scan.status !== "completed")
        throw new TRPCError({ code: "BAD_REQUEST", message: "O scan ainda não está concluído" });

      const { generateRegistoRiscos } = await import("../services/document-generator");
      const buffer   = await generateRegistoRiscos(input.scanId, ctx.org.id);
      const filename = `Registo_Riscos_${slugify(ctx.org.name)}_${isoDate(scan.createdAt)}.xlsx`;
      return { fileBase64: buffer.toString("base64"), filename, contentType: CONTENT_TYPES.xlsx };
    }),

  inventarioAtivos: freeProcedure
    .input(z.object({ scanId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const scan = await getScanById(input.scanId);
      if (!scan)
        throw new TRPCError({ code: "NOT_FOUND", message: "Scan não encontrado" });
      if (scan.organizationId !== ctx.org.id)
        throw new TRPCError({ code: "FORBIDDEN" });
      if (scan.status !== "completed")
        throw new TRPCError({ code: "BAD_REQUEST", message: "O scan ainda não está concluído" });

      const { generateInventarioAtivos } = await import("../services/document-generator");
      const buffer   = await generateInventarioAtivos(input.scanId, ctx.org.id);
      const filename = `Inventario_Ativos_${slugify(ctx.org.name)}_${isoDate(scan.createdAt)}.xlsx`;
      return { fileBase64: buffer.toString("base64"), filename, contentType: CONTENT_TYPES.xlsx };
    }),

  psi: freeProcedure
    .query(async ({ ctx }) => {
      const { generatePsi } = await import("../services/document-generator");
      const buffer   = await generatePsi(ctx.org.id);
      const filename = `Politica_Seguranca_${slugify(ctx.org.name)}_${isoDate(new Date())}.docx`;
      return { fileBase64: buffer.toString("base64"), filename, contentType: CONTENT_TYPES.docx };
    }),
});
