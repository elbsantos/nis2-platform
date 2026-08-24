/**
 * backend/routers/docs.router.ts
 *
 * tRPC procedures for the document catalog.
 * File download: served via Express (docs.handler.ts) for the course UI, and via
 * `downloadModel` (base64, same pattern as documents.router.ts) for the Guia dos
 * Documentos — o <a href download> cross-origin não estava a levar o cookie httpOnly
 * em produção; o tRPC (mesma origem, mesmo mecanismo do resto da app) leva sempre.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { freeProcedure } from "../middlewares/planGuard";
import { DOCS_CATALOG, getDocsByLesson, getDocById, LESSON_DIR } from "../content/docs-catalog";

const DOCS_BASE = path.resolve(__dirname, "../content/docs");

const MIME: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf:  "application/pdf",
};

export const docsRouter = {
  /** List all documents (with access flags per user plan) */
  list: freeProcedure
    .input(z.object({ lessonId: z.string().optional() }).optional())
    .query(({ ctx, input }) => {
      const docs = input?.lessonId
        ? getDocsByLesson(input.lessonId)
        : DOCS_CATALOG;

      return docs.map((doc) => ({
        ...doc,
        accessible: doc.plan === "free" || ctx.plan !== "free",
      }));
    }),

  /**
   * Downloads a catalog document (model) as base64 — mesma lógica de
   * docs.handler.ts (auth, gate de plano, resolução de caminho), mas via tRPC
   * para reutilizar a autenticação por cookie que já funciona no resto da app.
   */
  downloadModel: freeProcedure
    .input(z.object({ docId: z.string() }))
    .query(({ ctx, input }) => {
      const doc = getDocById(input.docId);
      if (!doc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Documento não encontrado" });
      }

      if (doc.plan === "pro" && ctx.plan === "free") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Plano Pro ou MSSP necessário para aceder a este documento",
        });
      }

      const dir = LESSON_DIR[doc.lessonId];
      const filePath = path.join(DOCS_BASE, dir, doc.filename);
      if (!fs.existsSync(filePath)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ficheiro não disponível" });
      }

      const buffer = fs.readFileSync(filePath);
      return {
        fileBase64:  buffer.toString("base64"),
        filename:    doc.filename,
        contentType: MIME[doc.type] ?? "application/octet-stream",
      };
    }),
};
