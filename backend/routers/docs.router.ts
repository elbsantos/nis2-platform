/**
 * backend/routers/docs.router.ts
 *
 * tRPC procedures for the document catalog.
 * Actual file download is served via Express (see docs.handler.ts).
 */

import { z } from "zod";
import { freeProcedure } from "../middlewares/planGuard";
import { DOCS_CATALOG, getDocsByLesson } from "../content/docs-catalog";

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
};
